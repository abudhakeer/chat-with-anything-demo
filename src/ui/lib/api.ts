export type DocumentPipeline = "text" | "vision";
export type DocumentStatus = "uploading" | "indexing" | "ready" | "failed";

export type DocumentResponse = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  r2Key: string;
  pipeline: DocumentPipeline;
  status: DocumentStatus;
  previewUrl: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type DocumentStatusResponse = {
  id: string;
  status: DocumentStatus;
  pipeline: DocumentPipeline;
  error: string | null;
};

export type SampleDocument = {
  id: string;
  label: string;
  description: string;
  chatPath: string;
};

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

export async function fetchDocument(docId: string): Promise<DocumentResponse> {
  const res = await fetch(`/api/v1/documents/${docId}`);
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Failed to load document (${res.status})`);
  }
  return (await res.json()) as DocumentResponse;
}

export async function fetchDocumentStatus(
  docId: string,
): Promise<DocumentStatusResponse> {
  const res = await fetch(`/api/v1/documents/${docId}/status`);
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Failed to load status (${res.status})`);
  }
  return (await res.json()) as DocumentStatusResponse;
}

export async function fetchSampleDocuments(): Promise<SampleDocument[]> {
  const res = await fetch("/api/v1/documents/samples");
  if (!res.ok) {
    return [];
  }
  const payload = (await res.json()) as { samples?: SampleDocument[] };
  return payload.samples ?? [];
}

export async function streamDocumentChat(args: {
  docId: string;
  message: string;
  history: Array<{ role: ChatRole; content: string }>;
  onToken: (token: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const res = await fetch(`/api/v1/documents/${args.docId}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: args.message,
      history: args.history,
    }),
    signal: args.signal,
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Chat failed (${res.status})`);
  }

  if (!res.body) {
    throw new Error("Chat response had no body.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const line = event
        .split("\n")
        .find((entry) => entry.startsWith("data:"));
      if (!line) continue;

      const data = line.slice(5).trim();
      if (!data) continue;

      const parsed = JSON.parse(data) as { type?: string; content?: string };
      if (parsed.type === "token" && parsed.content) {
        args.onToken(parsed.content);
      }
    }
  }
}

export function createMessageId(): string {
  return `msg_${crypto.randomUUID()}`;
}

export const SUGGESTED_PROMPTS = {
  text: [
    "Summarize this document in 3 bullet points.",
    "What are the key takeaways?",
    "List any dates, numbers, or names mentioned.",
  ],
  vision: [
    "Describe what you see in this image.",
    "What text is visible?",
    "What is the main subject?",
  ],
} as const;
