import {
  deleteDocument,
  findExpiredDocuments,
  updateDocumentStatus,
} from "../db/documents";
import { deleteAiSearchInstance } from "../lib/ai-search";
import { SAMPLE_DOCUMENTS } from "../lib/constants";

const SAMPLE_IDS = new Set(SAMPLE_DOCUMENTS.map((sample) => sample.id));

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

      if (document.pipeline === "text" && document.ai_search_instance_id) {
        await deleteAiSearchInstance(env, document.ai_search_instance_id);
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
