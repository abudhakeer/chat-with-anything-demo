import { Link, Route, Routes } from "react-router-dom";

function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-sky-400">
        Built on Cloudflare
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
        Chat with Anything
      </h1>
      <p className="max-w-lg text-base text-slate-400">
        Upload a document, preview it, and chat with it. Portfolio demo scaffold
        is running.
      </p>
      <Link
        to="/chat/demo"
        className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-400"
      >
        View chat shell
      </Link>
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
