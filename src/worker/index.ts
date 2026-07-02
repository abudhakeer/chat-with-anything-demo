import { Hono } from "hono";
import { cors } from "hono/cors";
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

export default app;
