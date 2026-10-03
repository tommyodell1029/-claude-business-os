// Origin allow-list for every /api/jarvis/* route (pattern 3 from docs/JARVIS_AUDIT.md).
// JARVIS_ALLOWED_ORIGINS = comma-separated exact origins (e.g. https://launchpadlocal.org). Unset -> same host only.

export function allowedOrigins(env: Record<string, string | undefined>): string[] {
  return (env.JARVIS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function originAllowed(req: Request, env: Record<string, string | undefined>): boolean {
  const origin = req.headers.get("origin");
  const list = allowedOrigins(env);
  if (origin) {
    if (origin === "null") return false;
    if (list.length) return list.includes(origin);
    try {
      return new URL(origin).host === new URL(req.url).host;
    } catch {
      return false;
    }
  }
  // Browsers always send Origin on POST/PUT/DELETE fetches; a missing one means a non-browser or a stripped header.
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  const site = req.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}
