export function TypingIndicator() {
  return (
    <div
      className="flex items-center gap-1.5 py-1"
      aria-label="Assistant is typing"
      role="status"
    >
      <span className="h-2 w-2 animate-bounce rounded-full bg-sky-400/90 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-sky-400/90 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-sky-400/90" />
    </div>
  );
}
