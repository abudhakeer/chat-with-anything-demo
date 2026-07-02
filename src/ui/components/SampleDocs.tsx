import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSampleDocuments, type SampleDocument } from "../lib/api";

export function SampleDocs() {
  const [samples, setSamples] = useState<SampleDocument[]>([]);

  useEffect(() => {
    void fetchSampleDocuments().then(setSamples);
  }, []);

  if (samples.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-xl space-y-3">
      <p className="text-center text-sm text-slate-400">Or try a sample</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {samples.map((sample) => (
          <Link
            key={sample.id}
            to={sample.chatPath}
            className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-4 text-left transition hover:border-sky-500/50 hover:bg-slate-900/70"
          >
            <p className="text-sm font-medium text-white">{sample.label}</p>
            <p className="mt-1 text-xs text-slate-400">{sample.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
