import { NextResponse } from "next/server";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  DocumentExtractionCandidate,
  DocumentExtractionResult,
  EssaySourceType,
} from "@/types/sidus";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const QUESTION_PATTERNS = [
  {
    label: "志望動機" as const,
    pattern: /(志望動機|志望理由|当社を志望する理由|応募理由)/u,
  },
  {
    label: "自己PR" as const,
    pattern: /(自己PR|自己ＰＲ|強み|長所|あなたらしさ)/u,
  },
  {
    label: "ガクチカ" as const,
    pattern: /(学生時代に力を入れたこと|ガクチカ|学生時代の取り組み|最も力を入れたこと)/u,
  },
];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "原稿ファイルを選択してください。" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { message: "8MB以下のPDF、Markdown、Textファイルを選択してください。" },
        { status: 413 },
      );
    }

    const fileName = file.name || "uploaded-document";
    const mimeType = file.type || inferMimeType(fileName);
    const sourceType = inferSourceType(fileName, mimeType);

    if (!sourceType) {
      return NextResponse.json(
        { message: ".pdf / .md / .txt の原稿ファイルに対応しています。" },
        { status: 415 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted =
      sourceType === "pdf"
        ? await extractPdfText(buffer)
        : {
            text: new TextDecoder("utf-8", { fatal: false }).decode(buffer),
            pageCount: undefined,
          };

    const cleanedText = cleanExtractedText(extracted.text);
    const warnings: string[] = [];

    if (cleanedText.length < 40) {
      warnings.push(
        "抽出できた文字数が少ないため、PDFが画像化されている可能性があります。本文をコピーして貼り付ける方法も試してください。",
      );
    }

    const result: DocumentExtractionResult = {
      fileName,
      mimeType,
      sourceType,
      pageCount: extracted.pageCount,
      rawText: extracted.text,
      cleanedText,
      candidates: extractCandidates(cleanedText),
      warnings,
    };

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "原稿ファイルの読み込みに失敗しました。",
      },
      { status: 500 },
    );
  }
}

function inferMimeType(fileName: string) {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".pdf")) return "application/pdf";
  if (lowerName.endsWith(".md") || lowerName.endsWith(".markdown"))
    return "text/markdown";
  if (lowerName.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function inferSourceType(
  fileName: string,
  mimeType: string,
): EssaySourceType | null {
  const lowerName = fileName.toLowerCase();
  if (mimeType.includes("pdf") || lowerName.endsWith(".pdf")) return "pdf";
  if (
    mimeType.includes("markdown") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".markdown")
  ) {
    return "markdown";
  }
  if (mimeType.startsWith("text/") || lowerName.endsWith(".txt")) return "text";
  return null;
}

async function extractPdfText(buffer: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  PDFParse.setWorker(
    pathToFileURL(
      path.join(
        process.cwd(),
        "node_modules",
        "pdf-parse",
        "dist",
        "worker",
        "pdf.worker.mjs",
      ),
    ).href,
  );

  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();

    return {
      text: result.text,
      pageCount: result.total,
    };
  } finally {
    await parser.destroy();
  }
}

function cleanExtractedText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractCandidates(text: string): DocumentExtractionCandidate[] {
  const blocks = text
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter((block) => block.length >= 40);

  const candidates = blocks
    .map((block, index) => {
      const questionPattern = QUESTION_PATTERNS.find((item) =>
        item.pattern.test(block),
      );
      const label: DocumentExtractionCandidate["label"] =
        questionPattern?.label ?? "その他";
      const question = extractQuestion(block, questionPattern?.pattern);
      const answer = extractAnswer(block, questionPattern?.pattern);

      return {
        id: `candidate-${index + 1}`,
        label,
        question,
        text: answer,
        confidence: questionPattern ? ("high" as const) : ("medium" as const),
      };
    })
    .filter((candidate) => candidate.text.length >= 40);

  if (candidates.length > 0) {
    return candidates.slice(0, 6);
  }

  return [
    {
      id: "candidate-full-text",
      label: "その他",
      question: "抽出全文",
      text,
      confidence: text.length >= 120 ? "medium" : "low",
    },
  ];
}

function extractQuestion(block: string, pattern?: RegExp) {
  const firstLine = block.split("\n")[0]?.trim() ?? "抽出候補";
  if (!pattern) return firstLine.slice(0, 80);

  const match = block.match(pattern);
  if (!match?.index) return firstLine.slice(0, 80);

  return block.slice(match.index, Math.min(block.length, match.index + 80));
}

function extractAnswer(block: string, pattern?: RegExp) {
  if (!pattern) return block;

  const parts = block.split(pattern);
  const tail = parts.at(-1)?.trim();
  return tail && tail.length >= 40 ? tail : block;
}
