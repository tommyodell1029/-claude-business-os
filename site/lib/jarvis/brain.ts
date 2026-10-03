// One conversational turn: Claude (model from config/models.yaml, role `small`, component `jarvis`) with tools.
// Plain fetch to the Anthropic Messages API, server-side only. Write tools come back as pending actions.
import type { Db } from "./db.ts";
import { anthropicKey, model } from "./models.ts";
import { systemPrompt } from "./persona.ts";
import { TZ } from "./status.ts";
import type { PendingAction, ToolCtx } from "./tools.ts";
import { anthropicTools, runTool } from "./tools.ts";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_MESSAGES = 20;
const MAX_CHARS = 2000;
const MAX_TOOL_ROUNDS = 5;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Validates the browser's history: user/assistant text only, capped, starting with user and ending with user. */
export function parseMessages(body: unknown): ChatMessage[] | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = (body as Record<string, unknown>).messages;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 40) return null;
  const out: ChatMessage[] = [];
  for (const m of raw) {
    if (typeof m !== "object" || m === null) return null;
    const { role, content } = m as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const text = content.replace(CONTROL, "").trim().slice(0, MAX_CHARS);
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n${text}`;
    else out.push({ role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  const trimmed = out.slice(-MAX_MESSAGES);
  while (trimmed.length && trimmed[0].role !== "user") trimmed.shift();
  if (!trimmed.length || trimmed[trimmed.length - 1].role !== "user") return null;
  return trimmed;
}

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
type ApiMessage = { role: "user" | "assistant"; content: string | unknown[] };

async function loadNotes(db: Db | null): Promise<{ kind: string; note: string }[]> {
  if (!db) return [];
  try {
    return await db.select<{ kind: string; note: string }>("jarvis_memory", "kind,note", [], "created_at.desc", 15);
  } catch {
    return [];
  }
}

export async function runTurn(messages: ChatMessage[], ctx: ToolCtx): Promise<{ reply: string; pending: PendingAction | null; tools: string[] }> {
  const key = anthropicKey(ctx.env);
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const nowLocal = new Intl.DateTimeFormat("en-US", { timeZone: TZ, dateStyle: "full", timeStyle: "short" }).format(new Date(ctx.now));
  const address = ctx.env.JARVIS_ADDRESS?.trim() || "sir";
  const system = systemPrompt({ address, nowLocal, notes: await loadNotes(ctx.db) });
  const convo: ApiMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const used: string[] = [];
  let pending: PendingAction | null = null;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const r = await ctx.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: model("small", "jarvis"),
        max_tokens: 700,
        system,
        tools: anthropicTools(),
        // No tools on the last round, so the model has to answer in words.
        ...(round === MAX_TOOL_ROUNDS ? { tool_choice: { type: "none" } } : {}),
        messages: convo,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}`);
    const data = (await r.json()) as { content: Block[]; stop_reason: string };
    const calls = data.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
    const text = data.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join(" ").trim();
    if (data.stop_reason !== "tool_use" || !calls.length) {
      return { reply: text || `I'm afraid I have nothing to add, ${address}.`, pending, tools: used };
    }
    convo.push({ role: "assistant", content: data.content });
    const results = await Promise.all(
      calls.map(async (c) => {
        used.push(c.name);
        const res = await runTool(c.name, c.input, ctx);
        if (res.pending) pending = res.pending;
        return { type: "tool_result", tool_use_id: c.id, content: JSON.stringify(res.content).slice(0, 12_000) };
      }),
    );
    convo.push({ role: "user", content: results });
  }
  return { reply: `I'm afraid that took too many steps, ${address}. Could you ask more narrowly?`, pending, tools: used };
}
