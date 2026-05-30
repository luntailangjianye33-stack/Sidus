import type { ApplicationTarget } from "@/types/sidus";

const companySuffixPattern =
  /(株式会社|有限会社|合同会社|合名会社|合資会社|相互会社|銀行|信用金庫|新聞社|建設|商事|Corporation|Corp\.?|Inc\.?|Co\.,?\s*Ltd\.?|LLC)$/iu;

const industrySignalPattern =
  /(総合建設|ゼネコン|都市開発|建設DX|金融|銀行|商社|メーカー|半導体|メディア|情報サービス|コンサル|IT|SaaS|製造|不動産|エネルギー|通信|小売|物流)/u;

export function normalizeApplicationTarget(
  target: ApplicationTarget,
): ApplicationTarget {
  const normalized: ApplicationTarget = {
    ...target,
    industry: target.industry.trim(),
    companyName: target.companyName.trim(),
    companyScope: normalizeCompanyScope(target.companyScope, target.companyName),
    corporateNumber: normalizeCorporateNumber(target.corporateNumber),
    position: target.position.trim(),
    companyMemo: target.companyMemo.trim(),
    referenceUrls: target.referenceUrls.map((source) => ({
      ...source,
      title: source.title.trim(),
      url: source.url?.trim(),
      memo: source.memo?.trim(),
    })),
  };

  if (
    looksLikeIndustryText(normalized.companyName) &&
    looksLikeCompanyName(normalized.industry)
  ) {
    return {
      ...normalized,
      industry: normalized.companyName,
      companyName: normalized.industry,
    };
  }

  return normalized;
}

function normalizeCorporateNumber(value: string | undefined) {
  const digits = (value ?? "").replace(/\D/gu, "");
  return digits.length === 13 ? digits : digits;
}

function normalizeCompanyScope(
  value: ApplicationTarget["companyScope"],
  companyName: string,
): NonNullable<ApplicationTarget["companyScope"]> {
  if (value === "domestic" || value === "foreign" || value === "auto") {
    return value;
  }
  return looksLikeForeignBrandName(companyName) ? "foreign" : "auto";
}

function looksLikeForeignBrandName(companyName: string) {
  const normalized = companyName.normalize("NFKC").toLowerCase();
  return /goldman|morgan|jpmorgan|jpモルガン|ゴールドマン|モルガン|マッキンゼー|bcg|ボストンコンサル|ベイン|google|amazon|microsoft|apple/u.test(
    normalized,
  );
}

function looksLikeIndustryText(value: string) {
  const text = value.trim();
  if (!text) return false;
  if (/[\/／|｜]/u.test(text)) return true;
  if (text.length > 18 && industrySignalPattern.test(text)) return true;
  return false;
}

function looksLikeCompanyName(value: string) {
  const text = value.trim();
  if (!text) return false;
  if (/[\/／|｜]/u.test(text)) return false;
  if (companySuffixPattern.test(text)) return true;
  return /^[A-Z0-9一-龯ぁ-んァ-ヶー・&＆.\s]{3,32}$/iu.test(text) &&
    !industrySignalPattern.test(text);
}
