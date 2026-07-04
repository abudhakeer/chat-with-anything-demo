import { useEffect, useId, useRef } from "react";
import architectureDiagram from "../assets/chat-with-anything-architecture.png";

const STEPS = [
  {
    title: "Upload",
    body: "You pick a file. The app checks rate limits, creates a document record in D1, and gives you a signed upload URL for R2.",
  },
  {
    title: "Process",
    body: "Images are ready immediately. PDFs are converted to text with Workers AI and stored alongside the original file.",
  },
  {
    title: "Chat",
    body: "Text files go to Llama 3.3 with the full document in context. Images go to Llama 3.2 Vision with the image bytes.",
  },
  {
    title: "Cleanup",
    body: "A daily cron job deletes uploads after 24 hours — R2 files, extracted text, chat history, and the D1 record.",
  },
] as const;

type HowItWorksModalProps = {
  open: boolean;
  onClose: () => void;
};

export function HowItWorksModal({ open, onClose }: HowItWorksModalProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-6"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-sky-950/30"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-5 py-4 sm:px-6">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-white sm:text-xl">
              How it works
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Upload a document, preview it, and chat with it — all on Cloudflare&apos;s edge.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
            <img
              src={architectureDiagram}
              alt="Architecture diagram showing upload flow through Cloudflare Worker to D1, R2, and KV, processing paths for text and vision, chat with Workers AI, and daily cleanup"
              className="h-auto w-full"
            />
          </div>

          <ol className="mt-6 space-y-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4 text-left">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-xs font-semibold text-sky-300">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-medium text-white">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
