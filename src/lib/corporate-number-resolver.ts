import type { ApplicationTarget } from "@/types/sidus";

export type CorporateNumberCandidate = {
  corporateNumber: string;
  name: string;
  prefectureName: string;
  cityName: string;
  streetNumber: string;
  assignmentDate: string;
  updateDate: string;
  closeDate: string;
  fullAddress: string;
  score: number;
  scoreReasons: string[];
};

export type CorporateNumberResolveResult = {
  configured: boolean;
  source: "nta_corporate_number_api";
  verification: "supported" | "weak" | "unverified";
  corporateNumber: string;
  legalName: string;
  headquarters: string;
  candidates: CorporateNumberCandidate[];
  warnings: string[];
};

const ntaApiBaseUrl = "https://api.houjin-bangou.nta.go.jp/3/name";
const ntaFetchTimeoutMs = 8_000;

export async function resolveCorporateNumberFromNta({
  applicationTarget,
  headquarters,
}: {
  applicationTarget: ApplicationTarget;
  headquarters?: string;
}): Promise<CorporateNumberResolveResult> {
  const appId = getNtaApplicationId();
  if (!appId) {
    return emptyCorporateNumberResult([
      "NTA_CORPORATE_NUMBER_APP_ID が未設定のため、国税庁 法人番号システムWeb-APIは実行していません。",
    ]);
  }

  const names = createCorporateNameQueries(applicationTarget.companyName);
  const responses = await Promise.all(
    names.map((name) => fetchNtaCorporationsByName(appId, name)),
  );
  const candidates = dedupeCorporateNumberCandidates(
    responses.flat().map((candidate) =>
      scoreCorporateNumberCandidate(candidate, applicationTarget, headquarters ?? ""),
    ),
  ).sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best || best.score < 120) {
    return {
      ...emptyCorporateNumberResult([
        "国税庁APIから候補は取得できましたが、社名・所在地の照合スコアが不足したため採用しませんでした。",
      ]),
      configured: true,
      candidates,
    };
  }

  return {
    configured: true,
    source: "nta_corporate_number_api",
    verification: best.score >= 180 ? "supported" : "weak",
    corporateNumber: best.corporateNumber,
    legalName: best.name,
    headquarters: best.fullAddress,
    candidates,
    warnings:
      best.score >= 180
        ? []
        : ["国税庁API候補の社名は一致しましたが、所在地照合が弱いため確認推奨です。"],
  };
}

function getNtaApplicationId() {
  return (
    process.env.NTA_CORPORATE_NUMBER_APP_ID?.trim() ||
    process.env.HOUJIN_BANGOU_APP_ID?.trim() ||
    ""
  );
}

async function fetchNtaCorporationsByName(
  appId: string,
  companyName: string,
): Promise<CorporateNumberCandidate[]> {
  const url = new URL(ntaApiBaseUrl);
  url.searchParams.set("id", appId);
  url.searchParams.set("name", companyName);
  url.searchParams.set("type", "12");
  url.searchParams.set("mode", "2");
  url.searchParams.set("target", "2");
  url.searchParams.set("change", "0");
  url.searchParams.set("close", "0");
  url.searchParams.set("kind", "03");

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/xml,text/xml,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(ntaFetchTimeoutMs),
    });
    if (!response.ok) return [];
    return parseNtaCorporationXml(await response.text());
  } catch {
    return [];
  }
}

function parseNtaCorporationXml(xml: string): CorporateNumberCandidate[] {
  const corporations = xml.match(/<corporation>[\s\S]*?<\/corporation>/gu) ?? [];
  return corporations
    .map((block) => {
      const prefectureName = getXmlTagValue(block, "prefectureName");
      const cityName = getXmlTagValue(block, "cityName");
      const streetNumber = getXmlTagValue(block, "streetNumber");
      const fullAddress = [prefectureName, cityName, streetNumber]
        .filter(Boolean)
        .join("");
      return {
        corporateNumber: getXmlTagValue(block, "corporateNumber"),
        name: getXmlTagValue(block, "name"),
        prefectureName,
        cityName,
        streetNumber,
        assignmentDate: getXmlTagValue(block, "assignmentDate"),
        updateDate: getXmlTagValue(block, "updateDate"),
        closeDate: getXmlTagValue(block, "closeDate"),
        fullAddress,
        score: 0,
        scoreReasons: [],
      };
    })
    .filter((candidate) => candidate.corporateNumber && candidate.name);
}

function getXmlTagValue(xml: string, tagName: string) {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "u"));
  return decodeXmlEntities(match?.[1]?.trim() ?? "");
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&#39;/gu, "'");
}

function scoreCorporateNumberCandidate(
  candidate: CorporateNumberCandidate,
  applicationTarget: ApplicationTarget,
  headquarters: string,
): CorporateNumberCandidate {
  let score = 0;
  const reasons: string[] = [];
  const normalizedCandidateName = normalizeCorporateText(candidate.name);
  const normalizedTargetName = normalizeCorporateText(applicationTarget.companyName);
  const normalizedTargetCore = normalizeCorporateText(
    stripJapaneseCorporateSuffix(applicationTarget.companyName),
  );

  if (normalizedCandidateName === normalizedTargetName) {
    score += 120;
    reasons.push("法人名が完全一致");
  } else if (
    normalizedTargetCore &&
    normalizedCandidateName.includes(normalizedTargetCore)
  ) {
    score += 70;
    reasons.push("法人名の主要部分が一致");
  }

  if (headquarters && addressLooksCompatible(candidate.fullAddress, headquarters)) {
    score += 90;
    reasons.push("所在地が既存ソースと一致");
  } else if (candidate.prefectureName && headquarters.includes(candidate.prefectureName)) {
    score += 25;
    reasons.push("都道府県が一致");
  }

  if (!candidate.closeDate) {
    score += 20;
    reasons.push("登記閉鎖なし");
  }

  return {
    ...candidate,
    score,
    scoreReasons: reasons,
  };
}

function createCorporateNameQueries(companyName: string) {
  const fullName = companyName.trim();
  const stripped = stripJapaneseCorporateSuffix(fullName);
  return [...new Set([fullName, stripped].filter((value) => value.length >= 2))];
}

function stripJapaneseCorporateSuffix(value: string) {
  return value
    .replace(/^株式会社/u, "")
    .replace(/株式会社$/u, "")
    .replace(/^合同会社/u, "")
    .replace(/合同会社$/u, "")
    .trim();
}

function normalizeCorporateText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[（）()［］\[\]・\s　]/gu, "")
    .toLowerCase();
}

function addressLooksCompatible(candidateAddress: string, targetAddress: string) {
  const candidate = normalizeAddress(candidateAddress);
  const target = normalizeAddress(targetAddress);
  if (!candidate || !target) return false;
  if (candidate.includes(target) || target.includes(candidate)) return true;
  const candidateTokens = createAddressTokens(candidate);
  const targetTokens = createAddressTokens(target);
  return candidateTokens.filter((token) => targetTokens.includes(token)).length >= 2;
}

function normalizeAddress(value: string) {
  return value
    .normalize("NFKC")
    .replace(/〒?\d{3}-?\d{4}/gu, "")
    .replace(/[、,\s　]/gu, "")
    .replace(/[０-９]/gu, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/丁目/gu, "-")
    .replace(/番地?/gu, "-")
    .replace(/号/gu, "")
    .replace(/[－ー―]/gu, "-")
    .toLowerCase();
}

function createAddressTokens(value: string) {
  return value
    .split(/(?=東京都|北海道|(?:京都|大阪)府|.{2,3}県|.{1,5}市|.{1,5}区|-)/u)
    .map((token) => token.replace(/^-+/u, "").trim())
    .filter((token) => token.length >= 2);
}

function dedupeCorporateNumberCandidates(candidates: CorporateNumberCandidate[]) {
  const map = new Map<string, CorporateNumberCandidate>();
  for (const candidate of candidates) {
    const previous = map.get(candidate.corporateNumber);
    if (!previous || candidate.score > previous.score) {
      map.set(candidate.corporateNumber, candidate);
    }
  }
  return [...map.values()];
}

function emptyCorporateNumberResult(
  warnings: string[] = [],
): CorporateNumberResolveResult {
  return {
    configured: false,
    source: "nta_corporate_number_api",
    verification: "unverified",
    corporateNumber: "",
    legalName: "",
    headquarters: "",
    candidates: [],
    warnings,
  };
}
