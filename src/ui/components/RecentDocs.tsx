import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRecentDocuments, type RecentDocument } from "../lib/api";

function formatRelativeTime(value: string): string {
  const timestamp = Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (!Number.isFinite(timestamp)) return "";

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function statusLabel(status: RecentDocument["status"]): string {
  if (status === "ready") return "Ready";
  if (status === "indexing") return "Processing";
  if (status === "failed") return "Failed";
  return "Uploading";
}

export function RecentDocs() {
  const [documents, setDocuments] = useState<RecentDocument[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void fetchRecentDocuments()
      .then(setDocuments)
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || documents.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-xl space-y-3">
      <p className="text-center text-sm text-slate-400">Your recent uploads</p>
      <div className="grid gap-3">
        {documents.map((document) => (
          <Link
            key={document.id}
            to={document.chatPath}
            className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-4 text-left transition hover:border-sky-500/50 hover:bg-slate-900/70"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-medium text-white">
                {document.fileName}
              </p>
              <span className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                {statusLabel(document.status)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {formatRelativeTime(document.createdAt)} · deleted after 24h
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
