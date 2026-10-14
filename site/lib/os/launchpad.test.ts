import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../jarvis/testkit.ts";
import { launchpadOverview } from "./launchpad.ts";

const NOW = Date.parse("2026-10-14T16:00:00Z");
const finding = { id: "no_click_to_call", title: "No tap-to-call link", evidence: "No link starting with tel:", url: "https://a.example/", weight: 15 };

test("overview counts come from the records; blockers and next step are computed, never invented", async () => {
  const fx = fakeDb({
    prospects: [
      { id: "p1", name: "Aldridge", industry: "plumbing", offer: "website", pipeline_stage: "audit_prepared", website_fit: 30, phone: "+19045550100", website_audit: { findings: [finding], verified_in_browser: "2026-10-14" } },
      { id: "p2", name: "Harry Hill", industry: "plumbing", offer: "website", pipeline_stage: "audit_prepared", website_fit: 45, phone: "+19045550101", website_audit: { findings: [] } },
      { id: "p3", name: "Estes", industry: "hvac", offer: "website", pipeline_stage: "qualified", website_fit: 10, next_follow_up: "2026-10-10" },
      { id: "p4", name: "Receptionist lead", industry: "plumbing", offer: "receptionist", pipeline_stage: "contacted" },
    ],
    client_projects: [], revenue_entries: [], outreach_events: [],
  });
  const o = await launchpadOverview(fx.db, NOW);
  assert.ok(o.counts);
  assert.equal(o.counts.identified, 3); // receptionist leads are not part of the website pipeline
  assert.equal(o.counts.auditPrepared, 2);
  assert.equal(o.counts.qualified, 3);
  assert.equal(o.counts.overdue, 1);
  assert.equal(o.counts.won, 0);
  assert.equal(o.revenueUsd, 0);
  assert.equal(o.ready[0].contactPath, "phone only (owner calls or visits)");
  assert.equal(o.ready.find((l) => l.name === "Aldridge")?.verifiedInBrowser, true);
  assert.ok(o.blockers.some((b) => /verified email/.test(b)));
  assert.match(o.next, /audit-ready/);
});

test("unreadable tables show as null (DATA UNAVAILABLE), not zero", async () => {
  const db = { select: async () => { throw new Error("down"); } } as unknown as Parameters<typeof launchpadOverview>[0];
  const o = await launchpadOverview(db, NOW);
  assert.equal(o.counts, null);
  assert.equal(o.revenueUsd, null);
  assert.equal(o.projects, null);
});
