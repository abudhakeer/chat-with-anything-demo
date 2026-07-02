import type { DocumentRecord } from "../db/types";
import { VISION_CHAT_MODEL } from "./constants";
import type { ChatMessage } from "./chat";
import { createSimulatedTokenStream } from "./sse";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function streamVisionDocumentChat(args: {
  env: Env;
  document: DocumentRecord;
  message: string;
  history: ChatMessage[];
}): Promise<ReadableStream<Uint8Array>> {
  const object = await args.env.BUCKET.get(args.document.r2_key);
  if (!object) {
    throw new Error("Image file not found in storage.");
  }

  const base64 = arrayBufferToBase64(await object.arrayBuffer());
  const dataUrl = `data:${args.document.mime_type};base64,${base64}`;

  const messages: Ai_Cf_Meta_Llama_3_2_11B_Vision_Instruct_Messages["messages"] = [
    {
      role: "system",
      content:
        "You describe and answer questions about the uploaded image. Be concise and specific.",
    },
    ...args.history.map((entry) => ({
      role: entry.role,
      content: entry.content,
    })),
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: dataUrl } },
        { type: "text", text: args.message },
      ],
    },
  ];

  const result = await args.env.AI.run(VISION_CHAT_MODEL, {
    messages,
    max_tokens: 1024,
  });

  const text =
    (result as Ai_Cf_Meta_Llama_3_2_11B_Vision_Instruct_Output).response ??
    "Sorry, I couldn't analyze this image.";

  return createSimulatedTokenStream(text);
}
