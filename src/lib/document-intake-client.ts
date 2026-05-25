import type { DocumentExtractionResult } from "@/types/sidus";

export async function requestDocumentExtraction(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/document-intake", {
    method: "POST",
    body: formData,
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message ?? "原稿ファイルの読み込みに失敗しました。");
  }

  return payload as DocumentExtractionResult;
}
