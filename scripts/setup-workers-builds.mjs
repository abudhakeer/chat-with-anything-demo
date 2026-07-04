#!/usr/bin/env node
/**
 * Connect this repo to Cloudflare Workers Builds via the REST API.
 *
 * Prerequisites:
 * - Cloudflare GitHub App already authorized (Workers → Settings → Builds → Connect once)
 * - User-scoped API token with "Workers Builds Configuration" (Edit) + "Workers Scripts" (Read)
 *   Create at: https://dash.cloudflare.com/profile/api-tokens
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=... pnpm setup:builds
 *   CLOUDFLARE_API_TOKEN=... pnpm setup:builds -- --trigger-build
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRIGGER_BUILD = process.argv.includes("--trigger-build");
const WORKER_NAME = "chat-with-anything";
const D1_DATABASE_NAME = "chat-with-anything";
const PRODUCTION_BRANCH = "main";

const BUILD_COMMAND = "pnpm build";
const DEPLOY_COMMAND = [
  `pnpm exec wrangler d1 migrations apply ${D1_DATABASE_NAME} --remote --config wrangler.jsonc`,
  "pnpm exec wrangler deploy --config wrangler.jsonc",
].join(" && ");

const BUILD_ENV = {
  NODE_VERSION: "22",
  PNPM_VERSION: "10",
};

function loadWranglerAccountId() {
  const whoami = execSync("pnpm exec wrangler whoami", {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const match = whoami.match(/│\s+[^│]+\s+│\s+([a-f0-9]{32})\s+│/);
  if (!match) {
    throw new Error("Could not read account ID from `wrangler whoami`. Set CLOUDFLARE_ACCOUNT_ID.");
  }
  return match[1];
}

function parseGitHubRepo() {
  const remote = execSync("git remote get-url origin", {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();

  const sshMatch = remote.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  const httpsMatch = remote.match(/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  const matched = sshMatch ?? httpsMatch;
  if (!matched) {
    throw new Error(`Could not parse GitHub owner/repo from origin: ${remote}`);
  }

  return {
    owner: matched[1],
    repo: matched[2],
  };
}

async function githubJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "chat-with-anything-setup-workers-builds",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status} for ${url}: ${body}`);
  }

  return response.json();
}

async function cfApi(accountId, token, method, apiPath, body) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}${apiPath}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );

  const payload = await response.json();
  if (!response.ok || !payload.success) {
    const message =
      payload.errors?.map((error) => error.message).join("; ") ??
      `HTTP ${response.status}`;
    throw new Error(`${method} ${apiPath} failed: ${message}`);
  }

  return payload.result;
}

async function getWorkerTag(accountId, token) {
  const scripts = await cfApi(accountId, token, "GET", "/workers/scripts");
  const worker = scripts.find((script) => script.id === WORKER_NAME);
  if (!worker?.tag) {
    throw new Error(
      `Worker "${WORKER_NAME}" not found. Deploy once with \`pnpm deploy\` before connecting Builds.`,
    );
  }
  return worker.tag;
}

async function getOrCreateBuildToken(accountId, token) {
  const tokens = await cfApi(accountId, token, "GET", "/builds/tokens");
  if (tokens.length > 0) {
    return tokens[0].build_token_uuid;
  }

  const created = await cfApi(accountId, token, "POST", "/builds/tokens", {
    build_token_name: "chat-with-anything-builds",
  });
  return created.build_token_uuid;
}

async function upsertRepoConnection(accountId, token, github) {
  const owner = await githubJson(`https://api.github.com/users/${github.owner}`);
  const repository = await githubJson(
    `https://api.github.com/repos/${github.owner}/${github.repo}`,
  );

  return cfApi(accountId, token, "PUT", "/builds/repos/connections", {
    provider_type: "github",
    provider_account_id: String(owner.id),
    provider_account_name: owner.login,
    repo_id: String(repository.id),
    repo_name: repository.name,
  });
}

function findProductionTrigger(triggers) {
  return triggers.find(
    (trigger) =>
      trigger.branch_includes?.includes(PRODUCTION_BRANCH) &&
      !trigger.branch_excludes?.includes(PRODUCTION_BRANCH),
  );
}

async function upsertProductionTrigger({
  accountId,
  token,
  workerTag,
  repoConnectionUuid,
  buildTokenUuid,
}) {
  const triggers = await cfApi(
    accountId,
    token,
    "GET",
    `/builds/workers/${workerTag}/triggers`,
  );

  const payload = {
    external_script_id: workerTag,
    repo_connection_uuid: repoConnectionUuid,
    build_token_uuid: buildTokenUuid,
    trigger_name: "Deploy production",
    build_command: BUILD_COMMAND,
    deploy_command: DEPLOY_COMMAND,
    root_directory: "/",
    branch_includes: [PRODUCTION_BRANCH],
    branch_excludes: [],
    path_includes: ["*"],
    path_excludes: [],
    build_caching_enabled: true,
  };

  const existing = findProductionTrigger(triggers);
  if (existing?.trigger_uuid) {
    const { external_script_id: _a, repo_connection_uuid: _b, build_token_uuid: _c, ...patch } =
      payload;
    return cfApi(
      accountId,
      token,
      "PATCH",
      `/builds/triggers/${existing.trigger_uuid}`,
      patch,
    );
  }

  return cfApi(accountId, token, "POST", "/builds/triggers", payload);
}

async function setBuildEnvironmentVariables(accountId, token, triggerUuid) {
  const variables = Object.fromEntries(
    Object.entries(BUILD_ENV).map(([key, value]) => [
      key,
      { value, is_secret: false },
    ]),
  );

  return cfApi(
    accountId,
    token,
    "PATCH",
    `/builds/triggers/${triggerUuid}/environment_variables`,
    variables,
  );
}

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    console.error(
      [
        "Missing CLOUDFLARE_API_TOKEN.",
        "",
        "Create a user-scoped token with:",
        "  - Workers Builds Configuration → Edit",
        "  - Workers Scripts → Read",
        "",
        "Then run:",
        "  CLOUDFLARE_API_TOKEN=... pnpm setup:builds",
      ].join("\n"),
    );
    process.exit(1);
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? loadWranglerAccountId();
  const github = parseGitHubRepo();

  console.log(`Account: ${accountId}`);
  console.log(`Worker:  ${WORKER_NAME}`);
  console.log(`Repo:    ${github.owner}/${github.repo}`);

  const workerTag = await getWorkerTag(accountId, token);
  console.log(`Worker tag: ${workerTag}`);

  const buildTokenUuid = await getOrCreateBuildToken(accountId, token);
  console.log(`Build token: ${buildTokenUuid}`);

  const repoConnection = await upsertRepoConnection(accountId, token, github);
  console.log(`Repo connection: ${repoConnection.repo_connection_uuid}`);

  const trigger = await upsertProductionTrigger({
    accountId,
    token,
    workerTag,
    repoConnectionUuid: repoConnection.repo_connection_uuid,
    buildTokenUuid,
  });
  console.log(`Production trigger: ${trigger.trigger_uuid}`);

  await setBuildEnvironmentVariables(accountId, token, trigger.trigger_uuid);
  console.log(`Build env: ${Object.keys(BUILD_ENV).join(", ")}`);

  if (TRIGGER_BUILD) {
    const build = await cfApi(
      accountId,
      token,
      "POST",
      `/builds/triggers/${trigger.trigger_uuid}/builds`,
      { branch: PRODUCTION_BRANCH },
    );
    console.log(`Triggered build: ${build.build_uuid ?? "(started)"}`);
  } else {
    console.log("");
    console.log("Done. Push to main to deploy, or rerun with --trigger-build.");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
