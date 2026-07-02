import { Hono } from "hono";
import { cors } from "hono/cors";

export type AppEnv = {
  Bindings: Env;
};

const app = new Hono<AppEnv>();

app.use("/api/*", cors());

app.get("/api/v1/health", (c) => {
  return c.json({ ok: true, service: "chat-with-anything" });
});

export default app;
