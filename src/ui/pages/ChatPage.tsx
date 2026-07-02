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
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      Indexing your document for chat… This usually takes under a minute.
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl animate-pulse flex-col gap-4 px-4 py-6">
      <div className="h-8 w-48 rounded-lg bg-slate-800" />
      <div className="grid flex-1 gap-4 lg:grid-cols-2">
        <div className="min-h-[420px] rounded-2xl bg-slate-900/60" />
        <div className="min-h-[420px] rounded-2xl bg-slate-900/60" />
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
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="text-xs text-sky-400 hover:text-sky-300">
            ← Home
          </Link>
          <h1 className="mt-1 truncate text-lg font-semibold text-white sm:text-xl">
            {document.fileName}
          </h1>
          <p className="text-xs text-slate-500">
            {document.pipeline === "vision" ? "Vision chat" : "Indexed text chat"} · auto-deletes
            in 24h
          </p>
        </div>
      </header>

      {document.status === "indexing" ? <IndexingState pipeline={document.pipeline} /> : null}

      <div className="mb-4 flex gap-2 lg:hidden">
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
            "min-h-[420px] lg:min-h-[calc(100vh-8rem)]",
            mobileTab === "preview" ? "block" : "hidden lg:block",
          ].join(" ")}
        >
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            {previewLabel(document)}
          </div>
          <div className="h-[calc(100%-1.5rem)] min-h-[360px]">
            <DocumentPreview document={document} />
          </div>
        </section>

        <section
          className={[
            "min-h-[420px] lg:min-h-[calc(100vh-8rem)]",
            mobileTab === "chat" ? "block" : "hidden lg:block",
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
