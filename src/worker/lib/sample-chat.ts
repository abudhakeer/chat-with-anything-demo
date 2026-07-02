import type { DocumentRecord } from "../db/types";
import { TEXT_CHAT_MODEL } from "./constants";
import type { ChatMessage } from "./chat";
import { createSimulatedTokenStream } from "./sse";

export async function streamSampleTextChat(args: {
  env: Env;
  document: DocumentRecord;
  message: string;
  history: ChatMessage[];
}): Promise<ReadableStream<Uint8Array>> {
  const object = await args.env.BUCKET.get(args.document.r2_key);
  if (!object) {
    throw new Error("Sample document file not found in storage.");
  }

  const documentText = await object.text();

  const messages: Ai_Cf_Meta_Llama_3_3_70B_Instruct_Fp8_Fast_Messages["messages"] = [
    {
      role: "system",
      content: [
        "You answer questions about the sample document below.",
        "Ground answers in the document only and keep replies concise.",
        "",
        "--- Document ---",
        documentText,
        "--- End document ---",
      ].join("\n"),
    },
    ...args.history.map((entry) => ({
      role: entry.role,
      content: entry.content,
    })),
    { role: "user", content: args.message },
  ];

  const result = await args.env.AI.run(TEXT_CHAT_MODEL, {
    messages,
    max_tokens: 1024,
  });

  const text =
    (result as Ai_Cf_Meta_Llama_3_3_70B_Instruct_Fp8_Fast_Output).response ??
    "Sorry, I couldn't generate an answer from this sample document.";

  return createSimulatedTokenStream(text);
}
