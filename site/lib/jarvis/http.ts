// Small response helpers shared by the /api/jarvis/* routes.
import { requireOwner } from "./auth.ts";

export function jsonResponse(body: unknown, status = 200, setCookie: string[] = []): Response {
  const h = new Headers({ "cache-control": "no-store", "content-type": "application/json" });
  for (const c of setCookie) h.append("set-cookie", c);
  return new Response(JSON.stringify(body), { status, headers: h });
}

/** Runs `handler` only for the signed-in owner; anyone else gets 401/403/503 and nothing else. */
export function withOwner(handler: (req: Request, ctx: { email: string }) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const auth = await requireOwner(req, process.env);
    if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status, auth.setCookie);
    const res = await handler(req, { email: auth.email });
    for (const c of auth.setCookie) res.headers.append("set-cookie", c);
    return res;
  };
}

/** Reads a JSON body with a size cap. Returns undefined when it is not JSON or too large. */
export async function readJson(req: Request, max = 32_000): Promise<unknown> {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return undefined;
  const raw = await req.text();
  if (raw.length > max) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
