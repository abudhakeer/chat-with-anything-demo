import type { DocumentResponse } from "./api";

export function isTextPreview(mimeType: string): boolean {
  return (
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    mimeType.startsWith("text/")
  );
}

export function isPdfPreview(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

export function isImagePreview(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function previewLabel(document: DocumentResponse): string {
  if (isPdfPreview(document.mimeType)) return "PDF preview";
  if (isImagePreview(document.mimeType)) return "Image preview";
  return "Document preview";
}
