import {
  deleteDocument,
  findExpiredDocuments,
  updateDocumentStatus,
} from "../db/documents";
import { extractedTextKey } from "../lib/pdf-extract";
import { SAMPLE_IDS } from "../lib/samples";

export async function expireDocuments(env: Env): Promise<number> {
  const nowIso = new Date().toISOString();
  const expired = await findExpiredDocuments(env.DB, nowIso);
  let deletedCount = 0;

  for (const document of expired) {
    if (SAMPLE_IDS.has(document.id)) {
      continue;
    }

    try {
      await env.BUCKET.delete(document.r2_key);

      if (document.mime_type === "application/pdf") {
        await env.BUCKET.delete(extractedTextKey(document));
      }

      await deleteDocument(env.DB, document.id);
      deletedCount += 1;
    } catch (error) {
      console.error("[expire]", document.id, error);
      await updateDocumentStatus(env.DB, document.id, "failed", {
        errorMessage: "Failed during automatic expiry cleanup.",
      });
    }
  }

  return deletedCount;
}
