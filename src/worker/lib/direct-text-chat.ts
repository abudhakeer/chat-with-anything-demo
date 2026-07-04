import type { DocumentRecord } from "../db/types";
import { TEXT_CHAT_MODEL } from "./constants";
import type { ChatMessage } from "./chat";
import { extractedTextKey } from "./pdf-extract";
import { createSimulatedTokenStream, transformWorkersAiStreamToAppSse } from "./sse";

export async function streamDirectTextChat(args: {
  env: Env;
  document: DocumentRecord;
  message: string;
  history: ChatMessage[];
  systemIntro?: string;
}): Promise<ReadableStream<Uint8Array>> {
  if (!args.env.AI) {
    throw new Error(
      "Workers AI is not configured. Restart pnpm dev:worker after updating wrangler.local.jsonc, or test chat on production.",
    );
  }

  // PDFs are extracted to plain text at upload time (see pdf-extract.ts);
  // TXT/MD files are already plain text and can be read as-is.
  const textKey =
    args.document.mime_type === "application/pdf"
      ? extractedTextKey(args.document)
      : args.document.r2_key;

  const object = await args.env.BUCKET.get(textKey);
  if (!object) {
    throw new Error("Document text not found in storage.");
  }

  const documentText = await object.text();

  const messages: Ai_Cf_Meta_Llama_3_3_70B_Instruct_Fp8_Fast_Messages["messages"] = [
    {
      role: "system",
      content: [
        args.systemIntro ??
          "You answer questions about the uploaded document below.",
        "Ground answers in the document only and keep replies concise.",
        "Format every reply in Markdown (bullet lists, headings, and bold where helpful).",
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

  try {
    const stream = (await args.env.AI.run(TEXT_CHAT_MODEL, {
      messages,
      max_tokens: 1024,
      stream: true,
    })) as ReadableStream;

    return transformWorkersAiStreamToAppSse(stream);
  } catch (error) {
    console.error("[direct-text-chat] streaming failed, falling back", error);

    const result = await args.env.AI.run(TEXT_CHAT_MODEL, {
      messages,
      max_tokens: 1024,
    });

    const text =
      (result as Ai_Cf_Meta_Llama_3_3_70B_Instruct_Fp8_Fast_Output).response ??
      "Sorry, I couldn't generate an answer from this document.";

    return createSimulatedTokenStream(text);
  }
}
