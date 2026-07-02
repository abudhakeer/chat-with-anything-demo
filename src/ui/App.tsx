import { Link, Route, Routes } from "react-router-dom";
import { UploadDropzone } from "./components/UploadDropzone";

function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-widest text-sky-400">
          Built on Cloudflare
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Chat with Anything
        </h1>
        <p className="mx-auto max-w-lg text-base text-slate-400">
          Upload a document, preview it, and chat with it. PDFs and text files are
          indexed for retrieval; images go straight to vision chat.
        </p>
      </div>

      <UploadDropzone />
    </main>
  );
}

function ChatPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-white">Chat shell</h1>
      <p className="text-slate-400">Split-view chat UI lands in Issue #9.</p>
      <Link to="/" className="text-sm text-sky-400 hover:text-sky-300">
        ← Back home
      </Link>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/chat/:docId" element={<ChatPage />} />
    </Routes>
  );
}
