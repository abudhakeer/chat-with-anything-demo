import { useMemo, useRef, useState } from "react";
import { ChatAvatar } from "./ChatAvatar";
import { ChatMarkdown } from "./ChatMarkdown";
import { TypingIndicator } from "./TypingIndicator";
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

function SendSpinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  );
}

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
      <div className="shrink-0 border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-medium text-white">Chat</h2>
        <p className="text-xs text-slate-400">
          {document.pipeline === "vision"
            ? "Vision model reads the image directly."
            : "Answers are grounded in indexed document content."}
        </p>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
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
          messages.map((message, index) => {
            const isStreamingAssistant =
              message.role === "assistant" &&
              isSending &&
              index === messages.length - 1 &&
              message.content.length === 0;

            return (
              <div
                key={message.id}
                className={[
                  "flex max-w-[94%] items-end gap-2.5",
                  message.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto",
                ].join(" ")}
              >
                <ChatAvatar role={message.role} />
                <div
                  className={[
                    "min-w-0 rounded-2xl px-4 py-3",
                    message.role === "user"
                      ? "bg-sky-600 text-white"
                      : "border border-slate-800 bg-slate-950/70 text-slate-100",
                  ].join(" ")}
                >
                  {message.role === "user" ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                  ) : isStreamingAssistant ? (
                    <TypingIndicator />
                  ) : (
                    <ChatMarkdown content={message.content} />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {disabledReason ? (
        <div className="shrink-0 border-t border-slate-800 px-4 py-3 text-sm text-amber-200">
          {disabledReason}
        </div>
      ) : null}

      {error ? (
        <div className="shrink-0 border-t border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <form
        className="shrink-0 border-t border-slate-800 p-4"
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
            className="inline-flex min-w-[4.5rem] items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? (
              <>
                <SendSpinner />
                <span className="sr-only">Sending</span>
              </>
            ) : (
              "Send"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
