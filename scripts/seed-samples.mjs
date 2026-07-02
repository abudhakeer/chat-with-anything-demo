#!/usr/bin/env node
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_URL =
  process.env.WORKER_URL ?? "https://chat-with-anything.abudhakeer.workers.dev";
const SEED_SECRET = process.env.SEED_SECRET;
const BUCKET = "chat-with-anything-files";
const REMOTE_FLAG = process.argv.includes("--local") ? [] : ["--remote"];

const SAMPLES = [
  {
    id: "sample_text_demo",
    file: "samples/sample-report.txt",
    fileName: "sample-report.txt",
    contentType: "text/plain",
  },
  {
    id: "sample_image_demo",
    file: "samples/sample-chart.png",
    fileName: "sample-chart.png",
    contentType: "image/png",
  },
];

function run(command, args) {
  execSync([command, ...args].join(" "), {
    cwd: ROOT,
    stdio: "inherit",
  });
}

if (!SEED_SECRET) {
  console.error("SEED_SECRET is required.");
  console.error("Set it in your shell, then run again:");
  console.error("  export SEED_SECRET=your-secret");
  console.error("  pnpm seed:samples");
  process.exit(1);
}

console.log(`Uploading sample files to R2 (${REMOTE_FLAG.length ? "remote" : "local"})...`);

for (const sample of SAMPLES) {
  const localPath = path.join(ROOT, sample.file);
  const objectKey = `${BUCKET}/uploads/${sample.id}/${sample.fileName}`;

  run("pnpm", [
    "exec",
    "wrangler",
    "r2",
    "object",
    "put",
    objectKey,
    `--file=${localPath}`,
    `--content-type=${sample.contentType}`,
    "--config",
    "wrangler.jsonc",
    ...REMOTE_FLAG,
  ]);
}

console.log("Registering samples in D1 and indexing text sample via Worker...");
console.log("Text sample indexing continues in the background after the API responds.");

const response = await fetch(`${WORKER_URL}/api/v1/admin/seed-samples`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${SEED_SECRET}`,
  },
});

const payload = await response.json().catch(() => null);

if (!response.ok) {
  console.error("Seed request failed:", response.status, payload);
  process.exit(1);
}

console.log("Sample seed complete:");
console.log(JSON.stringify(payload, null, 2));
