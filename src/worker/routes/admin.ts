import { Hono } from "hono";
import type { AppEnv } from "../index";
import { jsonError } from "../lib/http";
import { seedSampleDocuments } from "../lib/seed-samples";

function readSeedSecret(env: Env): string | undefined {
  return (env as Env & { SEED_SECRET?: string }).SEED_SECRET;
}

function isAuthorized(c: { req: { header: (name: string) => string | undefined }; env: Env }): boolean {
  const configuredSecret = readSeedSecret(c.env);
  if (!configuredSecret) {
    return false;
  }

  const authHeader = c.req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length) === configuredSecret;
  }

  return c.req.header("x-seed-secret") === configuredSecret;
}

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.post("/seed-samples", async (c) => {
  if (!readSeedSecret(c.env)) {
    return jsonError("Sample seeding is not configured.", 503);
  }

  if (!isAuthorized(c)) {
    return jsonError("Unauthorized.", 401);
  }

  try {
    const results = await seedSampleDocuments(c.env, c.executionCtx);
    return c.json({ ok: true, samples: results });
  } catch (error) {
    console.error("[admin.seed-samples]", error);
    return jsonError(
      error instanceof Error ? error.message : "Failed to seed sample documents.",
      500,
    );
  }
});
