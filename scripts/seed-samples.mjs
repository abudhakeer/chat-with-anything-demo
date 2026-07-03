#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const IS_LOCAL = process.argv.includes("--local");
const WRANGLER_CONFIG = IS_LOCAL ? "wrangler.local.jsonc" : "wrangler.jsonc";
const WORKER_URL =
  process.env.WORKER_URL ??
  (IS_LOCAL ? "http://127.0.0.1:8787" : "https://chat-with-anything.abudhakeer.workers.dev");
const BUCKET = "chat-with-anything-files";
const REMOTE_FLAG = IS_LOCAL ? [] : ["--remote"];

function loadDevVars() {
  const devVarsPath = path.join(ROOT, ".dev.vars");
  if (!fs.existsSync(devVarsPath)) {
    return {};
  }

  const values = {};
  for (const line of fs.readFileSync(devVarsPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return values;
}

const SEED_SECRET = process.env.SEED_SECRET ?? loadDevVars().SEED_SECRET;

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
  if (IS_LOCAL) {
    console.error("Add it to .dev.vars in the project root, for example:");
    console.error("  SEED_SECRET=your-local-secret");
    console.error("Then restart pnpm dev:worker and run:");
    console.error("  pnpm seed:samples --local");
  } else {
    console.error("Set it in your shell, then run again:");
    console.error("  export SEED_SECRET=your-secret");
    console.error("  pnpm seed:samples");
  }
  process.exit(1);
}

console.log(
  `Uploading sample files to R2 (${IS_LOCAL ? "local via wrangler.local.jsonc" : "remote"})...`,
);

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
    WRANGLER_CONFIG,
    ...REMOTE_FLAG,
  ]);
}

console.log(`Registering samples in D1 via ${WORKER_URL} ...`);

const response = await fetch(`${WORKER_URL}/api/v1/admin/seed-samples`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${SEED_SECRET}`,
  },
});

const payload = await response.json().catch(() => null);

if (!response.ok) {
  console.error("Seed request failed:", response.status, payload);
  if (IS_LOCAL && response.status === 401) {
    console.error(
      "Unauthorized: SEED_SECRET in your shell must match the value in .dev.vars (then restart pnpm dev:worker).",
    );
  }
  if (IS_LOCAL && response.status === 503) {
    console.error(
      "Worker has no SEED_SECRET. Add it to .dev.vars and restart pnpm dev:worker.",
    );
  }
  process.exit(1);
}

console.log("Sample seed complete:");
console.log(JSON.stringify(payload, null, 2));

const textSample = payload?.samples?.find((sample) => sample.id === "sample_text_demo");
if (textSample?.status === "indexing") {
  console.log("Waiting for text sample indexing to finish...");
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const statusResponse = await fetch(
      `${WORKER_URL}/api/v1/documents/sample_text_demo/status`,
    );
    const statusPayload = await statusResponse.json();
    console.log(`  status check ${attempt + 1}:`, statusPayload.status);
    if (statusPayload.status === "ready" || statusPayload.status === "failed") {
      break;
    }
  }
}
