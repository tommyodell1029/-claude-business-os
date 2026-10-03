// Confirmation gate (pattern 2 from docs/JARVIS_AUDIT.md: read freely, writes need an explicit grant).
// A write tool never runs when the model calls it. It becomes a `proposed` row in jarvis_actions with a 2-minute
// expiry. Only POST /api/jarvis/confirm, with that row's exact id and an explicit decision from the owner (a spoken
// yes/no or a tap), can move it on. The model has no tool that confirms anything.

export const CONFIRM_TTL_MS = 2 * 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);

export type ActionRow = {
  id: string;
  tool: string;
  status: "proposed" | "confirmed" | "rejected" | "expired" | "executed" | "failed";
  actor_email: string;
  summary: string;
  payload: Record<string, unknown>;
  expires_at: string;
};

export type ConfirmRequest = { actionId: string; decision: "confirm" | "reject"; via: "voice" | "tap" };

export function parseConfirmRequest(body: unknown): ConfirmRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (!isUuid(b.actionId)) return null;
  if (b.decision !== "confirm" && b.decision !== "reject") return null;
  if (b.via !== "voice" && b.via !== "tap") return null;
  return { actionId: b.actionId.toLowerCase(), decision: b.decision, via: b.via };
}

export function expiresAt(now = Date.now()): string {
  return new Date(now + CONFIRM_TTL_MS).toISOString();
}

export type GateDecision =
  | { ok: true }
  | { ok: false; reason: "not_found" | "id_mismatch" | "not_pending" | "expired" | "wrong_owner" };

/** Pure check run before anything executes. The DB claim in confirm route repeats status + expiry atomically. */
export function checkGate(action: ActionRow | null | undefined, req: ConfirmRequest, ownerEmail: string, now = Date.now()): GateDecision {
  if (!action) return { ok: false, reason: "not_found" };
  if (action.id.toLowerCase() !== req.actionId) return { ok: false, reason: "id_mismatch" };
  if (action.actor_email.toLowerCase() !== ownerEmail.toLowerCase()) return { ok: false, reason: "wrong_owner" };
  if (action.status !== "proposed") return { ok: false, reason: "not_pending" };
  const exp = Date.parse(action.expires_at);
  if (!Number.isFinite(exp) || exp <= now) return { ok: false, reason: "expired" };
  return { ok: true };
}
