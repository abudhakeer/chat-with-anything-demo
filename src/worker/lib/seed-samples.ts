import { getDocument, upsertSampleDocument } from "../db/documents";
import { indexTextDocument } from "./ai-search";
import {
  buildSampleR2Key,
  initialSampleStatus,
  SAMPLE_DOCUMENTS,
  sampleExpiresAt,
} from "./samples";

export type SeedSampleResult = {
  id: string;
  status: string;
  pipeline: string;
  error?: string;
};

export async function seedSampleDocuments(
  env: Env,
  ctx?: ExecutionContext,
): Promise<SeedSampleResult[]> {
  const results: SeedSampleResult[] = [];

  for (const sample of SAMPLE_DOCUMENTS) {
    const r2Key = buildSampleR2Key(sample.id, sample.fileName);
    const object = await env.BUCKET.head(r2Key);

    if (!object) {
      throw new Error(
        `Missing R2 object ${r2Key}. Run pnpm seed:samples to upload sample files first.`,
      );
    }

    const status = initialSampleStatus(sample.pipeline);
    await upsertSampleDocument(env.DB, {
      id: sample.id,
      fileName: sample.fileName,
      mimeType: sample.mimeType,
      sizeBytes: object.size,
      r2Key,
      pipeline: sample.pipeline,
      status,
      expiresAt: sampleExpiresAt(),
    });

    if (sample.pipeline === "text") {
      if (!env.AI_SEARCH) {
        throw new Error("AI Search is not configured.");
      }

      const document = await getDocument(env.DB, sample.id);
      if (!document) {
        throw new Error(`Sample document ${sample.id} not found after upsert.`);
      }

      if (ctx) {
        ctx.waitUntil(indexTextDocument(env, document));
        results.push({
          id: sample.id,
          status: "indexing",
          pipeline: sample.pipeline,
        });
        continue;
      }

      await indexTextDocument(env, document);
    }

    const finalDocument = await getDocument(env.DB, sample.id);
    results.push({
      id: sample.id,
      status: finalDocument?.status ?? status,
      pipeline: sample.pipeline,
      error: finalDocument?.error_message ?? undefined,
    });
  }

  return results;
}
