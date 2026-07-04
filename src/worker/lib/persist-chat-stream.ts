// Passes SSE through to the client while accumulating assistant tokens.
// Persists only after a successful `done` event with non-empty content.
export function persistChatStream(
  source: ReadableStream<Uint8Array>,
  onPersist: (content: string) => void | Promise<void>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let sawDone = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          controller.enqueue(value);

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const line = event.split("\n").find((entry) => entry.startsWith("data:"));
            if (!line) continue;

            const data = line.slice(5).trim();
            if (!data) continue;

            try {
              const parsed = JSON.parse(data) as { type?: string; content?: string };
              if (parsed.type === "token" && parsed.content) {
                accumulated += parsed.content;
              } else if (parsed.type === "done") {
                sawDone = true;
              }
            } catch {
              // Ignore malformed SSE chunks.
            }
          }
        }

        if (sawDone && accumulated.trim().length > 0) {
          await onPersist(accumulated);
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}
