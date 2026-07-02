import { Hono } from "hono";
import { cors } from "hono/cors";
import { expireDocuments } from "./jobs/expire-documents";
import { adminRoutes } from "./routes/admin";
import { documentsRoutes } from "./routes/documents";

export type AppEnv = {
  Bindings: Env;
};

const app = new Hono<AppEnv>();

app.use("/api/*", cors());

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
