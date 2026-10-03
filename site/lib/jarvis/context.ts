// Builds the per-request context for tools: service-role DB (server only), signed-in owner email, env, clock.
import { dbConfig, jarvisDb } from "./db.ts";
import type { ToolCtx } from "./tools.ts";

export function makeCtx(email: string, env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): ToolCtx {
  const cfg = dbConfig(env);
  return { db: cfg ? jarvisDb(cfg, fetchImpl) : null, email, env, fetchImpl, now: Date.now() };
}
