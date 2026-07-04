import { Hono } from "hono";
import { cors } from "hono/cors";
import { expireDocuments } from "./jobs/expire-documents";
import { adminRoutes } from "./routes/admin";
import { documentsRoutes } from "./routes/documents";
import { getOrCreateSessionId, withSessionCookie } from "./lib/session";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    sessionId: string;
  };
};

const app = new Hono<AppEnv>();

app.use("/api/*", cors());

app.use("/api/*", async (c, next) => {
  const { sessionId, isNew } = getOrCreateSessionId(c.req.raw);
  c.set("sessionId", sessionId);
  await next();
  if (isNew) {
    c.res = withSessionCookie(c.res, sessionId, c.req.raw);
  }
});

app.get("/api/v1/health", (c) => {
  return c.json({ ok: true, service: "chat-with-anything" });
});

app.route("/api/v1/documents", documentsRoutes);
app.route("/api/v1/admin", adminRoutes);

export default {
  fetch: app.fetch,
  scheduled: async (_controller, env, ctx) => {
    ctx.waitUntil(expireDocuments(env));
  },
} satisfies ExportedHandler<Env>;
