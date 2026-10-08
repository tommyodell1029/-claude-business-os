import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfirmation } from "./confirmWords.ts";
import { systemPrompt } from "./persona.ts";
import { briefing, tiles } from "./status.ts";
import { fakeDb, OWNER } from "./testkit.ts";

const NOW = Date.parse("2026-10-08T16:00:00Z");

test("ULTRON tiles: Money OS numbers from real tables (killed opportunities and test payments excluded)", async () => {
  const fx = fakeDb({
    opportunities: [{ status: "discovered" }, { status: "researched" }, { status: "killed" }],
    experiments: [{ status: "validating" }, { status: "live" }, { status: "killed" }],
    ai_cost_daily: [{ day: "2026-10-08", cost_usd: "0.0421" }],
    payments: [{ amount: "497.00", status: "paid", created_at: "2026-10-04T03:00:00Z", stripe_event_id: "evt_test" }],
    stripe_events: [{ id: "evt_test", livemode: false }],
    revenue_entries: [{ venture: "Test venture", source: "manual", amount_usd: "12.50", cost_usd: "0", occurred_on: "2026-10-07" }],
    outreach_events: [{ event_type: "reply", created_at: "2026-10-07T12:00:00Z" }],
  });
  const t = await tiles({ db: fx.db, email: OWNER, env: {}, fetchImpl: fetch, now: NOW });
  assert.equal(t.opportunities, 2);
  assert.equal(t.experiments_active, 2);
  assert.equal(t.ai_cost_today, 0.0421);
  assert.equal(t.revenue_month, 12.5, "the $497 sandbox payment never counts");
  assert.equal(t.replies_7d, 1);
});

test("ULTRON without a database reports unavailable, never a number", async () => {
  const ctx = { db: null, email: OWNER, env: {}, fetchImpl: fetch, now: NOW };
  const t = await tiles(ctx);
  assert.deepEqual([t.ai_cost_today, t.opportunities, t.experiments_active, t.revenue_month, t.replies_7d], [null, null, null, null, null]);
  const b = await briefing(ctx);
  assert.deepEqual([b.money_os.ai_cost_today, b.money_os.opportunities, b.money_os.revenue_month], [null, null, null]);
});

test("ULTRON persona and voice confirmation", () => {
  const p = systemPrompt({ address: "sir", nowLocal: "now", notes: [] });
  assert.match(p, /You are ULTRON/);
  assert.match(p, /wound down/);
  assert.doesNotMatch(p, /You are Jarvis/);
  assert.equal(parseConfirmation("ULTRON, do it."), "confirm");
  assert.equal(parseConfirmation("Jarvis, do it."), "confirm");
});
