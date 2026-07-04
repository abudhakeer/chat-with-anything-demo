import { Hono } from "hono";
import {
  createDocument,
  getDocument,
  toDocumentResponse,
  updateDocumentStatus,
} from "../db/documents";
import type { AppEnv } from "../index";
import { resolveStaleIndexing } from "../lib/indexing";
import { ChatRequestError, parseChatRequestBody } from "../lib/chat";
import { streamDirectTextChat } from "../lib/direct-text-chat";
import {
  buildDocumentId,
  buildR2Key,
  isDirectTextMimeType,
  parseUploadFile,
  requiresPdfExtraction,
  UploadValidationError,
  validateFileSize,
} from "../lib/files";
import { extractPdfDocument } from "../lib/pdf-extract";
import { jsonError } from "../lib/http";
import { checkUploadRateLimit, getClientIp } from "../lib/rate-limit";
import { streamSampleTextChat } from "../lib/sample-chat";
import { SAMPLE_DOCUMENTS, SAMPLE_IDS } from "../lib/samples";
import { sseResponse } from "../lib/sse";
import { streamVisionDocumentChat } from "../lib/vision";

type PresignBody = {
  fileName?: string;
  contentType?: string;
  size?: number;
};

export const documentsRoutes = new Hono<AppEnv>();

documentsRoutes.get("/samples", (c) => {
  return c.json({
    samples: SAMPLE_DOCUMENTS.map((sample) => ({
      id: sample.id,
      label: sample.label,
      description: sample.description,
      chatPath: `/chat/${sample.id}`,
    })),
  });
});

documentsRoutes.post("/presign", async (c) => {
  const ip = getClientIp(c.req.raw.headers);
  const rateLimit = await checkUploadRateLimit(c.env.RATE_LIMIT, ip);
  if (!rateLimit.allowed) {
    return jsonError("Upload rate limit exceeded. Try again in an hour.", 429);
  }

  let body: PresignBody;
  try {
    body = await c.req.json<PresignBody>();
  } catch {
    return jsonError("Invalid JSON body.");
  }

  if (!body.fileName || !body.contentType || body.size === undefined) {
    return jsonError("fileName, contentType, and size are required.");
  }

  try {
    const parsed = parseUploadFile(body.fileName, body.contentType);
    validateFileSize(body.size, parsed.pipeline);
    const id = buildDocumentId();
    const r2Key = buildR2Key(id, parsed.fileName);

    const document = await createDocument(c.env.DB, {
      id,
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      sizeBytes: body.size,
      r2Key,
      pipeline: parsed.pipeline,
      status: "uploading",
    });

    const origin = new URL(c.req.url).origin;

    return c.json({
      id: document.id,
      status: document.status,
      r2Key: document.r2_key,
      uploadUrl: `${origin}/api/v1/documents/${document.id}/upload`,
    });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return jsonError(error.message, 400);
    }
    console.error("[documents.presign]", error);
    return jsonError("Failed to prepare upload.", 500);
  }
});

documentsRoutes.put("/:id/upload", async (c) => {
  const id = c.req.param("id");
  const document = await getDocument(c.env.DB, id);

  if (!document) {
    return jsonError("Document not found.", 404);
  }

  if (document.status !== "uploading") {
    return jsonError("Document is not awaiting upload.", 409);
  }

  const contentType =
    c.req.header("content-type")?.split(";")[0]?.trim() || document.mime_type;
  const body = c.req.raw.body;

  if (!body) {
    return jsonError("Upload body is required.", 400);
  }

  try {
    await c.env.BUCKET.put(document.r2_key, body, {
      httpMetadata: {
        contentType,
      },
    });

    return c.json({ ok: true, id: document.id, r2Key: document.r2_key });
  } catch (error) {
    console.error("[documents.upload]", error);
    await updateDocumentStatus(c.env.DB, id, "failed", {
      errorMessage: "Failed to store file.",
    });
    return jsonError("Failed to store uploaded file.", 500);
  }
});

documentsRoutes.post("/:id/complete", async (c) => {
  const id = c.req.param("id");
  const document = await getDocument(c.env.DB, id);

  if (!document) {
    return jsonError("Document not found.", 404);
  }

  if (document.status !== "uploading") {
    return jsonError("Document upload is already complete.", 409);
  }

  const object = await c.env.BUCKET.head(document.r2_key);
  if (!object) {
    return jsonError("Uploaded file not found in storage.", 400);
  }

  const nextStatus: "ready" | "indexing" =
    document.pipeline === "vision" || isDirectTextMimeType(document.mime_type)
      ? "ready"
      : "indexing";
  const updated = await updateDocumentStatus(c.env.DB, id, nextStatus);

  if (!updated) {
    return jsonError("Failed to update document status.", 500);
  }

  if (requiresPdfExtraction(updated.mime_type)) {
    // Run extraction inline instead of via ctx.waitUntil(), which is
    // hard-capped at 30 seconds after the response is sent (Cloudflare
    // platform limit). Awaiting it here keeps the work inside the request's
    // own execution lifetime so the response reflects the real, final status.
    await extractPdfDocument(c.env, updated);
  }

  const latest = await getDocument(c.env.DB, id);
  return c.json(toDocumentResponse(latest ?? updated));
});

documentsRoutes.post("/:id/chat", async (c) => {
  const document = await getDocument(c.env.DB, c.req.param("id"));
  if (!document) {
    return jsonError("Document not found.", 404);
  }

  if (document.status === "indexing") {
    return jsonError("Document is still indexing. Try again shortly.", 409);
  }

  if (document.status === "failed") {
    return jsonError(document.error_message ?? "Document processing failed.", 422);
  }

  if (document.status !== "ready") {
    return jsonError("Document is not ready for chat.", 409);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return jsonError("Invalid JSON body.");
  }

  try {
    const { message, history } = parseChatRequestBody(body);

    const stream =
      document.pipeline === "text"
        ? await (SAMPLE_IDS.has(document.id)
            ? streamSampleTextChat({
                env: c.env,
                document,
                message,
                history,
              })
            : streamDirectTextChat({
                env: c.env,
                document,
                message,
                history,
              }))
        : await streamVisionDocumentChat({
              env: c.env,
              document,
              message,
              history,
            });

    return sseResponse(stream);
  } catch (error) {
    if (error instanceof ChatRequestError) {
      return jsonError(error.message, 400);
    }
    console.error("[documents.chat]", error);
    return jsonError(
      error instanceof Error ? error.message : "Failed to generate chat response.",
      500,
    );
  }
});

documentsRoutes.get("/:id", async (c) => {
  const document = await getDocument(c.env.DB, c.req.param("id"));
  if (!document) {
    return jsonError("Document not found.", 404);
  }
  return c.json(toDocumentResponse(document));
});

documentsRoutes.get("/:id/status", async (c) => {
  const id = c.req.param("id");
  let document = await getDocument(c.env.DB, id);
  if (!document) {
    return jsonError("Document not found.", 404);
  }

  document = await resolveStaleIndexing(c.env.DB, document, Date.now());

  return c.json({
    id: document.id,
    status: document.status,
    pipeline: document.pipeline,
    error: document.error_message,
  });
});

documentsRoutes.get("/:id/preview", async (c) => {
  const document = await getDocument(c.env.DB, c.req.param("id"));
  if (!document) {
    return jsonError("Document not found.", 404);
  }

  const object = await c.env.BUCKET.get(document.r2_key);
  if (!object) {
    return jsonError("Preview file not found.", 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", document.mime_type);
  }
  if (document.mime_type === "application/pdf") {
    headers.set("content-disposition", "inline");
  }
  headers.set("cache-control", "private, max-age=3600");

  return new Response(object.body, { headers });
});
