export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export function truncateChatHistory(
  history: ChatMessage[],
  maxMessages = 20,
): ChatMessage[] {
  return history
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    )
    .slice(-maxMessages);
}

export function parseChatRequestBody(body: unknown): {
  message: string;
  history: ChatMessage[];
} {
  if (!body || typeof body !== "object") {
    throw new ChatRequestError("Invalid JSON body.");
  }

  const record = body as { message?: unknown; history?: unknown };
  if (typeof record.message !== "string" || record.message.trim().length === 0) {
    throw new ChatRequestError("message is required.");
  }

  const history: ChatMessage[] = [];
  if (Array.isArray(record.history)) {
    for (const item of record.history) {
      if (!item || typeof item !== "object") continue;
      const entry = item as { role?: unknown; content?: unknown };
      if (
        (entry.role === "user" || entry.role === "assistant") &&
        typeof entry.content === "string"
      ) {
        history.push({ role: entry.role, content: entry.content });
      }
    }
  }

  return {
    message: record.message.trim(),
    history: truncateChatHistory(history),
  };
}

export class ChatRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatRequestError";
  }
}
