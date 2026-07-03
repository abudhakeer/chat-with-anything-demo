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

function IndexingState({ pipeline }: { pipeline: DocumentResponse["pipeline"] }) {
  if (pipeline === "vision") {
    return null;
  }

  return (
    <div className="shrink-0 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      Indexing your document for chat… This usually takes under a minute.
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
          <IndexingState pipeline={document.pipeline} />
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
