import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { HowItWorksModal } from "./components/HowItWorksModal";
import { RecentDocs } from "./components/RecentDocs";
import { SampleDocs } from "./components/SampleDocs";
import { UploadDropzone } from "./components/UploadDropzone";
import { ChatPage } from "./pages/ChatPage";

function HomePage() {
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  return (
    <>
      <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
        <button
          type="button"
          onClick={() => setHowItWorksOpen(true)}
          className="absolute right-6 top-6 text-sm text-slate-400 transition hover:text-sky-300"
        >
          How it works
        </button>

        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-widest text-sky-400">
            Built on Cloudflare
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Chat with Anything
          </h1>
          <p className="mx-auto max-w-lg text-base text-slate-400">
            Upload a document, preview it, and chat with it. PDFs and text files are
            processed for chat; images go straight to vision chat.
          </p>
        </div>

        <UploadDropzone />
        <RecentDocs />
        <SampleDocs />
      </main>

      <HowItWorksModal open={howItWorksOpen} onClose={() => setHowItWorksOpen(false)} />
    </>
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
