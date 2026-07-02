import { getDocument, upsertSampleDocument } from "../db/documents";
import {
  buildSampleR2Key,
  SAMPLE_DOCUMENTS,
  sampleExpiresAt,
} from "./samples";

export type SeedSampleResult = {
  id: string;
  status: string;
  pipeline: string;
  error?: string;
};

export async function seedSampleDocuments(env: Env): Promise<SeedSampleResult[]> {
  const results: SeedSampleResult[] = [];

  for (const sample of SAMPLE_DOCUMENTS) {
    const r2Key = buildSampleR2Key(sample.id, sample.fileName);
    const object = await env.BUCKET.head(r2Key);

    if (!object) {
      throw new Error(
        `Missing R2 object ${r2Key}. Run pnpm seed:samples to upload sample files first.`,
      );
    }

    await upsertSampleDocument(env.DB, {
      id: sample.id,
      fileName: sample.fileName,
      mimeType: sample.mimeType,
      sizeBytes: object.size,
      r2Key,
      pipeline: sample.pipeline,
      status: "ready",
      expiresAt: sampleExpiresAt(),
    });

    const finalDocument = await getDocument(env.DB, sample.id);
    results.push({
      id: sample.id,
      status: finalDocument?.status ?? "ready",
      pipeline: sample.pipeline,
      error: finalDocument?.error_message ?? undefined,
    });
  }

  return results;
}
