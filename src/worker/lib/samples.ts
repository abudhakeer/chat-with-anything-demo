import type { DocumentPipeline, DocumentStatus } from "../db/types";

export type SampleDefinition = {
  id: string;
  label: string;
  description: string;
  fileName: string;
  mimeType: string;
  pipeline: DocumentPipeline;
  localFile: string;
};

export const SAMPLE_DOCUMENTS = [
  {
    id: "sample_text_demo",
    label: "Sample report (text)",
    description: "Pre-indexed quarterly report for text chat",
    fileName: "sample-report.txt",
    mimeType: "text/plain",
    pipeline: "text",
    localFile: "samples/sample-report.txt",
  },
  {
    id: "sample_image_demo",
    label: "Sample chart (image)",
    description: "Vision pipeline demo chart image",
    fileName: "sample-chart.png",
    mimeType: "image/png",
    pipeline: "vision",
    localFile: "samples/sample-chart.png",
  },
] as const satisfies readonly SampleDefinition[];

export type SampleDocumentId = (typeof SAMPLE_DOCUMENTS)[number]["id"];

export const SAMPLE_IDS = new Set<string>(SAMPLE_DOCUMENTS.map((sample) => sample.id));

export function buildSampleR2Key(sampleId: string, fileName: string): string {
  return `uploads/${sampleId}/${fileName}`;
}

/** Samples are exempt from the 24h retention cron; use a far-future date as backup. */
export function sampleExpiresAt(): string {
  return "2099-01-01T00:00:00.000Z";
}

export function initialSampleStatus(pipeline: DocumentPipeline): DocumentStatus {
  return pipeline === "vision" ? "ready" : "indexing";
}

export function getSampleDefinition(id: string): SampleDefinition | undefined {
  return SAMPLE_DOCUMENTS.find((sample) => sample.id === id);
}
