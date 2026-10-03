// Second half of the confirmation gate: the owner's explicit yes/no on one pending action.
// The row is claimed with a conditional update (status=proposed AND not expired), so a double tap, a replay or a
// late confirm cannot run an action twice or after its two minutes are up.
import type { ActionRow, ConfirmRequest } from "./gate.ts";
import { checkGate } from "./gate.ts";
import type { ToolCtx } from "./tools.ts";
import { executeWrite } from "./tools.ts";

export type ConfirmOutcome = { ok: boolean; status: "executed" | "rejected" | "failed" | "expired" | "refused"; message: string };

const MESSAGES: Record<string, string> = {
  not_found: "I can't find that request, sir.",
  id_mismatch: "That confirmation doesn't match the pending request, sir.",
  wrong_owner: "That request isn't yours to confirm.",
  not_pending: "That request has already been dealt with, sir.",
  expired: "That request has expired, sir. Ask me again if you still want it.",
};

export async function handleConfirm(req: ConfirmRequest, ctx: ToolCtx): Promise<ConfirmOutcome> {
  const db = ctx.db;
  if (!db) return { ok: false, status: "failed", message: "Data unavailable: the database is not configured." };
  const rows = await db.select<ActionRow>("jarvis_actions", "id,tool,status,actor_email,summary,payload,expires_at", [["id", "eq", req.actionId]], undefined, 1);
  const action = rows[0];
  const gate = checkGate(action, req, ctx.email, ctx.now);
  const nowIso = new Date(ctx.now).toISOString();
  if (!gate.ok) {
    if (gate.reason === "expired" && action) {
      await db.update("jarvis_actions", [["id", "eq", action.id], ["status", "eq", "proposed"]], { status: "expired" }).catch(() => []);
    }
    return { ok: false, status: gate.reason === "expired" ? "expired" : "refused", message: MESSAGES[gate.reason] };
  }

  if (req.decision === "reject") {
    await db.update("jarvis_actions", [["id", "eq", action.id], ["status", "eq", "proposed"]], { status: "rejected", decided_at: nowIso, decided_via: req.via });
    return { ok: true, status: "rejected", message: "Very good, sir. I've cancelled it." };
  }

  const claimed = await db.update("jarvis_actions", [["id", "eq", action.id], ["status", "eq", "proposed"], ["expires_at", "gt", nowIso]], {
    status: "confirmed",
    decided_at: nowIso,
    decided_via: req.via,
  });
  if (!claimed.length) return { ok: false, status: "refused", message: MESSAGES.not_pending };

  try {
    const result = await executeWrite(action.tool, action.payload, action.id, ctx);
    await db.update("jarvis_actions", [["id", "eq", action.id]], { status: "executed", executed_at: new Date().toISOString(), result: result.slice(0, 500) });
    return { ok: true, status: "executed", message: `Done, sir. ${result}` };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await db.update("jarvis_actions", [["id", "eq", action.id]], { status: "failed", error: msg }).catch(() => []);
    return { ok: false, status: "failed", message: `I couldn't complete that, sir: ${msg}.` };
  }
}
