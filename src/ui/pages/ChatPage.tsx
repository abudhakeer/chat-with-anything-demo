import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChatPanel } from "../components/ChatPanel";
import { DocumentPreview } from "../components/DocumentPreview";
import {
  fetchDocument,
  fetchDocumentStatus,
  type DocumentResponse,
} from "../lib/api";
import { previewLabel } from "../lib/preview";

type MobileTab = "preview" | "chat";

function parseDocumentTimestamp(value: string): number {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return Date.parse(normalized);
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function IndexingState({
  pipeline,
  startedAt,
}: {
  pipeline: DocumentResponse["pipeline"];
  startedAt: string;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAtMs = parseDocumentTimestamp(startedAt);
    if (!Number.isFinite(startedAtMs)) {
      return;
    }

    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  if (pipeline === "vision") {
    return null;
  }

  const progress = Math.min(95, Math.round((elapsedSeconds / 60) * 100));
  const isSlow = elapsedSeconds >= 45;

  return (
    <div className="shrink-0 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-200/30 border-t-amber-100"
          aria-hidden="true"
        />
        <div>
          <p className="font-medium">Indexing your document for chat…</p>
          <p className="mt-0.5 text-xs text-amber-100/80">
            Elapsed: {formatElapsed(elapsedSeconds)} · usually under a minute or two
          </p>
        </div>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-950/50"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Indexing progress"
      >
        <div
          className="h-full rounded-full bg-amber-400 transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      {isSlow ? (
        <p className="mt-3 text-xs leading-relaxed text-amber-100/90">
          Still working… larger PDFs can take a little longer to index. Hang tight.
        </p>
      ) : null}
    </div>
  );
}

function FailedState({ error }: { error: string | null }) {
  // Only true local-dev-specific failures (missing AI Search binding, or the
  // WebSocket disconnect that happens over the wrangler dev remote binding)
  // should point people at `pnpm deploy`. A generic timeout can happen in
  // production too and shouldn't be blamed on local dev.
  const isLocalDevHint =
    error?.includes("deploy") || error?.includes("WebSocket") || error?.includes("1006");

  return (
    <div className="shrink-0 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
      <p className="font-medium">Couldn&apos;t prepare this document for chat</p>
      <p className="mt-1 text-xs leading-relaxed text-rose-100/90">
        {error ?? "Indexing failed. Try uploading again."}
      </p>
      {isLocalDevHint ? (
        <p className="mt-2 text-xs leading-relaxed text-rose-100/80">
          PDF chat needs Cloudflare AI Search, which is unreliable in{" "}
          <code className="rounded bg-rose-950/40 px-1">pnpm dev:worker</code>. Deploy with{" "}
          <code className="rounded bg-rose-950/40 px-1">pnpm deploy</code>, or upload a TXT/MD
          file for instant local chat.
        </p>
      ) : null}
      <Link
        to="/"
        className="mt-3 inline-block text-xs font-medium text-rose-200 underline-offset-2 hover:text-white hover:underline"
      >
        Upload another file
      </Link>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="mx-auto flex h-dvh max-w-6xl animate-pulse flex-col overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
      <div className="shrink-0">
        <div className="flex h-5 items-center gap-2">
          <div className="h-4 w-4 rounded bg-slate-800" />
          <div className="h-4 flex-1 rounded bg-slate-800" />
          <div className="hidden h-3 w-24 rounded bg-slate-800/70 md:block" />
        </div>
      </div>
      <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <div className="flex min-h-0 flex-col gap-2">
          <div className="h-3 w-28 rounded bg-slate-800/70" />
          <div className="min-h-0 flex-1 rounded-2xl bg-slate-900/60" />
        </div>
        <div className="flex min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/50">
          <div className="shrink-0 border-b border-slate-800 px-4 py-3">
            <div className="h-4 w-12 rounded bg-slate-800" />
            <div className="mt-2 h-3 w-48 rounded bg-slate-800/70" />
          </div>
          <div className="min-h-0 flex-1 space-y-3 px-4 py-4">
            <div className="h-16 w-3/4 rounded-2xl bg-slate-800/60" />
            <div className="ml-auto h-12 w-2/3 rounded-2xl bg-sky-900/40" />
          </div>
          <div className="shrink-0 border-t border-slate-800 p-4">
            <div className="h-11 rounded-xl bg-slate-800/60" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatPage() {
  const { docId = "" } = useParams();
  const [document, setDocument] = useState<DocumentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileTab, setMobileTab] = useState<MobileTab>("preview");

  useEffect(() => {
    if (!docId) {
      setError("Missing document id.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const initial = await fetchDocument(docId);
        if (!cancelled) {
          setDocument(initial);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setDocument(null);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load document.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docId]);

  useEffect(() => {
    if (!docId || !document || document.status !== "indexing") {
      return;
    }

    const interval = window.setInterval(() => {
      void fetchDocumentStatus(docId)
        .then((status) => {
          setDocument((current) =>
            current
              ? {
                  ...current,
                  status: status.status,
                  error: status.error,
                }
              : current,
          );
        })
        .catch(() => {
          // Keep polling on transient errors.
        });
    }, 2500);

    return () => window.clearInterval(interval);
  }, [docId, document?.status]);

  const chatDisabled = useMemo(() => {
    if (!document) return true;
    if (document.status === "failed") return true;
    if (document.pipeline === "text" && document.status !== "ready") return true;
    return document.status !== "ready";
  }, [document]);

  const chatDisabledReason = useMemo(() => {
    if (!document) return undefined;
    if (document.status === "failed") {
      return document.error ?? "This document failed to process.";
    }
    if (document.status === "indexing") {
      return "Chat unlocks after indexing completes.";
    }
    if (document.status !== "ready") {
      return "Document is not ready for chat yet.";
    }
    return undefined;
  }, [document]);

  if (loading) {
    return <ChatSkeleton />;
  }

  if (error || !document) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold text-white">Document unavailable</h1>
        <p className="text-slate-400">{error ?? "Document not found."}</p>
        <Link to="/" className="text-sm text-sky-400 hover:text-sky-300">
          ← Back home
        </Link>
      </main>
    );
  }

  return (
    <div className="mx-auto flex h-dvh max-w-6xl flex-col overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
      <header className="mb-3 grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-3">
        <Link
          to="/"
          className="text-sm text-sky-400 transition hover:text-sky-300"
          aria-label="Back home"
        >
          ←
        </Link>
        <h1 className="min-w-0 truncate text-center text-sm font-semibold text-white sm:text-base">
          {document.fileName}
        </h1>
        <p className="hidden truncate text-right text-xs text-slate-500 md:block">
          {document.pipeline === "vision" ? "Vision chat" : "Indexed text chat"} · 24h
        </p>
      </header>

      {document.status === "indexing" ? (
        <div className="mb-3 shrink-0">
          <IndexingState pipeline={document.pipeline} startedAt={document.updatedAt} />
        </div>
      ) : null}

      {document.status === "failed" ? (
        <div className="mb-3 shrink-0">
          <FailedState error={document.error} />
        </div>
      ) : null}

      <div className="mb-3 flex shrink-0 gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("preview")}
          className={[
            "flex-1 rounded-lg px-3 py-2 text-sm",
            mobileTab === "preview"
              ? "bg-sky-500 text-white"
              : "border border-slate-700 text-slate-300",
          ].join(" ")}
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("chat")}
          className={[
            "flex-1 rounded-lg px-3 py-2 text-sm",
            mobileTab === "chat"
              ? "bg-sky-500 text-white"
              : "border border-slate-700 text-slate-300",
          ].join(" ")}
        >
          Chat
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <section
          className={[
            "flex min-h-0 flex-col",
            mobileTab === "preview" ? "flex" : "hidden lg:flex",
          ].join(" ")}
        >
          <div className="mb-2 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">
            {previewLabel(document)}
          </div>
          <div className="min-h-0 flex-1">
            <DocumentPreview document={document} />
          </div>
        </section>

        <section
          className={[
            "min-h-0",
            mobileTab === "chat" ? "flex flex-col" : "hidden lg:flex lg:flex-col",
          ].join(" ")}
        >
          <ChatPanel
            document={document}
            disabled={chatDisabled}
            disabledReason={chatDisabledReason}
          />
        </section>
      </div>
    </div>
  );
}
