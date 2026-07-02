export type PresignResponse = {
  id: string;
  status: string;
  r2Key: string;
  uploadUrl: string;
};

export type CompleteResponse = {
  id: string;
  fileName: string;
  mimeType: string;
  status: string;
  previewUrl: string;
};

export async function presignUpload(args: {
  fileName: string;
  contentType: string;
  size: number;
}): Promise<PresignResponse> {
  const res = await fetch("/api/v1/documents/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Presign failed (${res.status})`);
  }

  return (await res.json()) as PresignResponse;
}

export async function uploadDocumentFile(args: {
  file: File;
  uploadUrl: string;
  onProgress?: (pct: number) => void;
}): Promise<void> {
  const { file, uploadUrl, onProgress } = args;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Upload failed (${xhr.status})`));
    };

    xhr.onerror = () => reject(new Error("Upload failed due to a network error."));
    xhr.onabort = () => reject(new Error("Upload aborted."));
    xhr.send(file);
  });
}

export async function completeUpload(docId: string): Promise<CompleteResponse> {
  const res = await fetch(`/api/v1/documents/${docId}/complete`, {
    method: "POST",
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Complete failed (${res.status})`);
  }

  return (await res.json()) as CompleteResponse;
}

export async function uploadDocument(args: {
  file: File;
  onProgress?: (pct: number) => void;
}): Promise<CompleteResponse> {
  const presign = await presignUpload({
    fileName: args.file.name,
    contentType: args.file.type || "application/octet-stream",
    size: args.file.size,
  });

  await uploadDocumentFile({
    file: args.file,
    uploadUrl: presign.uploadUrl,
    onProgress: args.onProgress,
  });

  return completeUpload(presign.id);
}

export const ACCEPTED_FILE_TYPES = {
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
} as const;

export const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
];
