import type { DocumentPipeline } from "../db/types";

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_INDEX_BYTES = 4 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "txt",
  "md",
  "png",
  "jpg",
  "jpeg",
  "webp",
]);

const MIME_TO_PIPELINE: Record<string, DocumentPipeline> = {
  "application/pdf": "text",
  "text/plain": "text",
  "text/markdown": "text",
  "image/png": "vision",
  "image/jpeg": "vision",
  "image/webp": "vision",
};

export interface ParsedUploadFile {
  fileName: string;
  mimeType: string;
  extension: string;
  pipeline: DocumentPipeline;
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[^\w.\-()+ ]+/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "file";
}

export function getExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? (parts.at(-1) ?? "") : "";
}

export function parseUploadFile(fileName: string, contentType: string): ParsedUploadFile {
  const safeName = sanitizeFileName(fileName);
  const extension = getExtension(safeName);

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new UploadValidationError(
      "Unsupported file type. Allowed: PDF, TXT, MD, PNG, JPG, WEBP.",
    );
  }

  const mimeType = normalizeMimeType(contentType, extension);
  const pipeline = MIME_TO_PIPELINE[mimeType];

  if (!pipeline) {
    throw new UploadValidationError("Unsupported content type for this file.");
  }

  return {
    fileName: safeName,
    mimeType,
    extension,
    pipeline,
  };
}

export function validateFileSize(
  sizeBytes: number,
  pipeline?: DocumentPipeline,
): void {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new UploadValidationError("Invalid file size.");
  }

  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new UploadValidationError("File exceeds the 20MB limit.");
  }

  if (pipeline === "text" && sizeBytes > MAX_TEXT_INDEX_BYTES) {
    throw new UploadValidationError(
      "PDF and text files must be 4MB or smaller for AI Search indexing.",
    );
  }
}

export function buildDocumentId(): string {
  return `doc_${crypto.randomUUID()}`;
}

export function buildR2Key(docId: string, fileName: string): string {
  return `uploads/${docId}/${fileName}`;
}

/** TXT/MD are read from R2 and sent to Workers AI directly (no AI Search). */
export function isDirectTextMimeType(mimeType: string): boolean {
  return mimeType === "text/plain" || mimeType === "text/markdown";
}

export function requiresAiSearchIndexing(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

export const PDF_LOCAL_DEV_MESSAGE =
  "PDF chat requires the deployed app (AI Search does not work in wrangler dev). Run pnpm deploy and upload there, or try a TXT/MD file locally.";

function normalizeMimeType(contentType: string, extension: string): string {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";

  if (normalized && MIME_TO_PIPELINE[normalized]) {
    return normalized;
  }

  switch (extension) {
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";
    case "md":
      return "text/markdown";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return normalized || "application/octet-stream";
  }
}

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}
