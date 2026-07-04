import type { DocumentRecord } from "../db/types";
import { streamDirectTextChat } from "./direct-text-chat";
import type { ChatMessage } from "./chat";

export async function streamSampleTextChat(args: {
  env: Env;
  document: DocumentRecord;
  message: string;
  history: ChatMessage[];
}): Promise<ReadableStream<Uint8Array>> {
  return streamDirectTextChat({
    ...args,
    isSample: true,
  });
}
