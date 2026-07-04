export function formatSseEvent(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

export function createSimulatedTokenStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const parts = text.match(/\S+\s*|\s+/g) ?? [text];

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(formatSseEvent({ type: "token", content: part })));
      }
      controller.enqueue(encoder.encode(formatSseEvent({ type: "done" })));
      controller.close();
    },
  });
}

// Workers AI's own streaming format emits `data: {"response": "..."}` chunks
// (not OpenAI's `choices[].delta.content` shape used by transformOpenAiStreamToAppSse).
export function transformWorkersAiStreamToAppSse(
  source: ReadableStream,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = (source as ReadableStream<Uint8Array>).getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") {
              continue;
            }

            try {
              const parsed = JSON.parse(data) as { response?: string };
              if (parsed.response) {
                controller.enqueue(
                  encoder.encode(formatSseEvent({ type: "token", content: parsed.response })),
                );
              }
            } catch {
              // Ignore malformed SSE chunks.
            }
          }
        }

        controller.enqueue(encoder.encode(formatSseEvent({ type: "done" })));
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export function transformOpenAiStreamToAppSse(
  source: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") {
              controller.enqueue(encoder.encode(formatSseEvent({ type: "done" })));
              continue;
            }

            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const token = parsed.choices?.[0]?.delta?.content;
              if (token) {
                controller.enqueue(
                  encoder.encode(formatSseEvent({ type: "token", content: token })),
                );
              }
            } catch {
              // Ignore malformed SSE chunks.
            }
          }
        }

        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith("data:")) {
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") {
              controller.enqueue(encoder.encode(formatSseEvent({ type: "done" })));
            }
          }
        }

        controller.enqueue(encoder.encode(formatSseEvent({ type: "done" })));
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}
