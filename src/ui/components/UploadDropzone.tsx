import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ACCEPTED_EXTENSIONS,
  uploadDocument,
} from "../lib/upload";

type UploadState = "idle" | "uploading" | "processing" | "error";

export function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;

      setState("uploading");
      setProgress(0);
      setError(null);

      try {
        const result = await uploadDocument({
          file,
          onProgress: (pct) => {
            setProgress(pct);
            if (pct >= 100) {
              setState("processing");
            }
          },
        });
        navigate(`/chat/${result.id}`);
      } catch (uploadError) {
        setState("error");
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "Upload failed. Please try again.",
        );
      }
    },
    [navigate],
  );

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void handleFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    void handleFile(event.dataTransfer.files[0]);
  };

  const isUploading = state === "uploading" || state === "processing";

  return (
    <div className="w-full max-w-xl space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !isUploading && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!isUploading) inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={[
          "rounded-2xl border border-dashed px-6 py-10 text-center transition",
          dragOver
            ? "border-sky-400 bg-sky-400/10"
            : "border-slate-700 bg-slate-900/40 hover:border-slate-500",
          isUploading ? "pointer-events-none opacity-80" : "cursor-pointer",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          className="hidden"
          onChange={onInputChange}
        />

        {isUploading ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-200">
              {state === "processing" ? "Processing document…" : "Uploading…"}
            </p>
            <div className="mx-auto h-2 w-full max-w-sm overflow-hidden rounded-full bg-slate-800">
              <div
                className={[
                  "h-full rounded-full bg-sky-500 transition-all",
                  state === "processing" ? "animate-pulse" : "",
                ].join(" ")}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">
              {state === "processing" ? "Usually just a few seconds for PDFs." : `${progress}%`}
            </p>
          </div>
        ) : (
          <>
            <p className="text-lg font-medium text-white">Drag & drop or click to upload</p>
            <p className="mt-2 text-sm text-slate-400">
              PDF · TXT · MD · PNG · JPG · WEBP
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Max 20MB · PDF/TXT/MD indexed up to 4MB
            </p>
          </>
        )}
      </div>

      <p className="text-center text-xs text-slate-500">
        Uploads are automatically deleted after 24 hours.
      </p>

      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}
