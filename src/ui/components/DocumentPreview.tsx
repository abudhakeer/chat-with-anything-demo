import { useEffect, useState } from "react";
import type { DocumentResponse } from "../lib/api";
import { isImagePreview, isPdfPreview, isTextPreview } from "../lib/preview";

type DocumentPreviewProps = {
  document: DocumentResponse;
};

function TextPreviewSkeleton() {
  return (
    <div className="space-y-3 animate-pulse" aria-hidden="true">
      {["w-full", "w-11/12", "w-4/5", "w-full", "w-3/4", "w-5/6", "w-2/3", "w-4/5"].map(
        (widthClass) => (
          <div key={widthClass} className={`h-3 rounded bg-slate-800/80 ${widthClass}`} />
        ),
      )}
    </div>
  );
}

export function DocumentPreview({ document }: DocumentPreviewProps) {
  const previewUrl = document.previewUrl;
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTextPreview(document.mimeType)) {
      setTextContent(null);
      setTextError(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(previewUrl);
        if (!res.ok) {
          throw new Error("Could not load text preview.");
        }
        const text = await res.text();
        if (!cancelled) {
          setTextContent(text);
          setTextError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setTextContent(null);
          setTextError(
            error instanceof Error ? error.message : "Could not load text preview.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [document.mimeType, previewUrl]);

  if (isPdfPreview(document.mimeType)) {
    return (
      <iframe
        title={document.fileName}
        src={previewUrl}
        className="h-full w-full rounded-xl border border-slate-800 bg-white"
      />
    );
  }

  if (isImagePreview(document.mimeType)) {
    return (
      <div className="flex h-full items-center justify-center overflow-auto rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <img
          src={previewUrl}
          alt={document.fileName}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      </div>
    );
  }

  if (isTextPreview(document.mimeType)) {
    return (
      <div className="h-full overflow-auto rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        {textError ? (
          <p className="text-sm text-red-300">{textError}</p>
        ) : textContent === null ? (
          <TextPreviewSkeleton />
        ) : (
          <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-200">
            {textContent}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">
      Preview not available for this file type.
    </div>
  );
}
