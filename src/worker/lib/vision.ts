import type { DocumentRecord } from "../db/types";
import { VISION_CHAT_MODEL } from "./constants";
import type { ChatMessage } from "./chat";
import { createSimulatedTokenStream } from "./sse";

const MAX_VISION_IMAGE_BYTES = 512 * 1024;

async function ensureVisionModelLicensed(env: Env): Promise<void> {
  try {
    await env.AI.run(VISION_CHAT_MODEL, { prompt: "agree" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Thank you for agreeing")) {
      return;
    }
    throw error;
  }
}

function requiresVisionLicenseAcceptance(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("agree") && !message.includes("Thank you for agreeing");
}

async function runVisionModel(
  env: Env,
  messages: Ai_Cf_Meta_Llama_3_2_11B_Vision_Instruct_Messages["messages"],
): Promise<Ai_Cf_Meta_Llama_3_2_11B_Vision_Instruct_Output> {
  try {
    return (await env.AI.run(VISION_CHAT_MODEL, {
      messages,
      max_tokens: 1024,
    })) as Ai_Cf_Meta_Llama_3_2_11B_Vision_Instruct_Output;
  } catch (error) {
    if (!requiresVisionLicenseAcceptance(error)) {
      throw error;
    }

    await ensureVisionModelLicensed(env);
    return (await env.AI.run(VISION_CHAT_MODEL, {
      messages,
      max_tokens: 1024,
    })) as Ai_Cf_Meta_Llama_3_2_11B_Vision_Instruct_Output;
  }
}

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

  const bytes = await object.arrayBuffer();
  if (bytes.byteLength > MAX_VISION_IMAGE_BYTES) {
    throw new Error(
      "Image is too large for vision chat. Please upload an image under 512KB.",
    );
  }

  const dataUrl = `data:${args.document.mime_type};base64,${arrayBufferToBase64(bytes)}`;

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
        { type: "text", text: args.message },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ];

  const result = await runVisionModel(args.env, messages);
  const text = result.response ?? "Sorry, I couldn't analyze this image.";

  return createSimulatedTokenStream(text);
}
