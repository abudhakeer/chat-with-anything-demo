import { useMemo, useRef, useState } from "react";
import {
  createMessageId,
  streamDocumentChat,
  SUGGESTED_PROMPTS,
  type ChatMessage,
  type DocumentResponse,
} from "../lib/api";

type ChatPanelProps = {
  document: DocumentResponse;
  disabled?: boolean;
  disabledReason?: string;
};

export function ChatPanel({ document, disabled, disabledReason }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const prompts = useMemo(
    () =>
      document.pipeline === "vision"
        ? SUGGESTED_PROMPTS.vision
        : SUGGESTED_PROMPTS.text,
    [document.pipeline],
  );

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || disabled || isSending) return;

    setError(null);
    setIsSending(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: trimmed,
    };
    const assistantId = createMessageId();

    setMessages((current) => [...current, userMessage]);
    setInput("");
    scrollToBottom();

    setMessages((current) => [
      ...current,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const history = [...messages, userMessage].map((message) => ({
        role: message.role,
        content: message.content,
      }));

      await streamDocumentChat({
        docId: document.id,
        message: trimmed,
        history,
        signal: abortRef.current.signal,
        onToken: (token) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + token }
                : message,
            ),
          );
          scrollToBottom();
        },
      });
    } catch (sendError) {
      if (sendError instanceof DOMException && sendError.name === "AbortError") {
        return;
      }
      setMessages((current) => current.filter((message) => message.id !== assistantId));
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Failed to send message. Please try again.",
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/50">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-medium text-white">Chat</h2>
        <p className="text-xs text-slate-400">
          {document.pipeline === "vision"
            ? "Vision model reads the image directly."
            : "Answers are grounded in indexed document content."}
        </p>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              Ask a question about {document.fileName}.
            </p>
            <div className="flex flex-wrap gap-2">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={disabled || isSending}
                  onClick={() => void sendMessage(prompt)}
                  className="rounded-full border border-slate-700 px-3 py-1.5 text-left text-xs text-slate-300 transition hover:border-sky-500/60 hover:text-white disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={[
                "max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                message.role === "user"
                  ? "ml-auto bg-sky-600 text-white"
                  : "mr-auto border border-slate-800 bg-slate-950/70 text-slate-100",
              ].join(" ")}
            >
              {message.content || (isSending ? "…" : "")}
            </div>
          ))
        )}
      </div>

      {disabledReason ? (
        <div className="border-t border-slate-800 px-4 py-3 text-sm text-amber-200">
          {disabledReason}
        </div>
      ) : null}

      {error ? (
        <div className="border-t border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <form
        className="border-t border-slate-800 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(input);
        }}
      >
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={disabled || isSending}
            placeholder={disabled ? "Chat unavailable" : "Ask about this document…"}
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none ring-sky-500/30 placeholder:text-slate-500 focus:ring-2 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={disabled || isSending || input.trim().length === 0}
            className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
