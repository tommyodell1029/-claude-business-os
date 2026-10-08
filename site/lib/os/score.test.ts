import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../jarvis/testkit.ts";
import { addEvidence, applyProposal, createOpportunity, listRanked, normalizeEvidence, slugify } from "./opportunities.ts";
import type { ScoreConfig, SubScores } from "./score.ts";
import { DIMENSIONS, confidence, explain, labels, overallScore, rank, validateProposal } from "./score.ts";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const CFG: ScoreConfig = {
  weights: Object.fromEntries(DIMENSIONS.map((d) => [d, 1])) as ScoreConfig["weights"],
  inverted: ["competition"],
  confidence: { evidence_target: 4, domain_target: 2, recency_days: 90 },
  labels: { high_score_min: 7, strong_evidence: { min_confidence: 0.6, min_domains: 3 }, fast_validation: { max_validation_difficulty: 3, max_days_to_first_dollar: 14 } },
};

test("overall score: weighted mean of known sub-scores only, bad dimensions inverted, none known -> null", () => {
  assert.equal(overallScore({}, CFG), null);
  assert.equal(overallScore({ demand: 8, monetization: null }, CFG), 8);
  assert.equal(overallScore({ demand: 8, competition: 8 }, CFG), 5, "competition 8 counts as 2");
  const w = { ...CFG, weights: { ...CFG.weights, demand: 3 } };
  assert.equal(overallScore({ demand: 10, trend: 0 }, w), 7.5);
});

test("confidence: zero without evidence; rises with coverage, evidence count, distinct domains and freshness", () => {
  const all = Object.fromEntries(DIMENSIONS.map((d) => [d, 5])) as SubScores;
  const fresh = (d: string) => ({ source_domain: d, observed_at: "2026-10-01T00:00:00Z" });
  assert.equal(confidence(all, [], NOW, CFG), 0);
  assert.equal(confidence(all, [fresh("a.com"), fresh("b.com"), fresh("c.com"), fresh("d.com")], NOW, CFG), 1);
  const half = Object.fromEntries(DIMENSIONS.slice(0, 5).map((d) => [d, 5])) as SubScores;
  assert.ok(confidence(half, [fresh("a.com")], NOW, CFG) < confidence(all, [fresh("a.com")], NOW, CFG));
  const stale = [{ source_domain: "a.com", observed_at: "2025-01-01T00:00:00Z" }];
  assert.ok(confidence(all, stale, NOW, CFG) < confidence(all, [fresh("a.com")], NOW, CFG));
});

test("labels are nested: high score, + strong evidence, + fast validation", () => {
  const base = { overall: 7.5, confidence: 0.7, domains: 3, validationDifficulty: 2, daysToFirstDollar: 10 };
  assert.equal(labels(base, CFG).tier, 3);
  assert.equal(labels(base, CFG).text, "HIGH SCORE + STRONG EVIDENCE + FAST VALIDATION");
  assert.equal(labels({ ...base, daysToFirstDollar: 30 }, CFG).tier, 2);
  assert.equal(labels({ ...base, domains: 2 }, CFG).tier, 1, "strong evidence needs 3 distinct sources");
  assert.equal(labels({ ...base, overall: 6.9 }, CFG).tier, 0, "fast + evidenced but not a high score is untiered");
  assert.equal(labels({ ...base, overall: null }, CFG).tier, 0);
  assert.equal(labels({ ...base, validationDifficulty: null }, CFG).fastValidation, false, "unknown is never fast");
});

test("ranking: tier first, then score, then confidence; unscored last", () => {
  const mk = (id: string, overall: number | null, conf: number, tier: 0 | 1 | 2 | 3) =>
    ({ id, overall, confidence: conf, labels: { highScore: tier > 0, strongEvidence: tier > 1, fastValidation: tier > 2, tier, text: "" } });
  const out = rank([mk("a", 9.5, 0.2, 1), mk("b", 7.1, 0.9, 3), mk("c", null, 0, 0), mk("d", 8, 0.5, 1), mk("e", 8, 0.6, 1)]);
  assert.deepEqual(out.map((x) => x.id), ["b", "a", "e", "d", "c"]);
});

test("proposal validation: unknown fields and out-of-range values rejected; scores without reasons dropped", () => {
  assert.equal(validateProposal([]).ok, false);
  assert.equal(validateProposal({ scores: { demand: 5 }, overall_score: 10 }).ok, false, "the model cannot set the overall score");
  assert.equal(validateProposal({ scores: { vibes: 9 }, reasons: { vibes: "x" } }).ok, false);
  assert.equal(validateProposal({ scores: { demand: 11 }, reasons: { demand: "x" } }).ok, false);
  assert.equal(validateProposal({ scores: { demand: "9" }, reasons: { demand: "x" } }).ok, false);
  assert.equal(validateProposal({ validation_difficulty: 0 }).ok, false);
  assert.equal(validateProposal({ est_days_to_first_dollar: 2.5 }).ok, false);
  const ok = validateProposal({ scores: { demand: 8.123, trend: 6 }, reasons: { demand: "  3 sources show weekly searches\u0007 ", trend: "" }, validation_difficulty: 2 });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual(ok.value.scores, { demand: 8.12 });
    assert.equal(ok.value.reasons.demand, "3 sources show weekly searches");
    assert.equal(ok.value.validationDifficulty, 2);
    assert.equal(ok.value.daysToFirstDollar, null);
  }
});

test("explain: strongest and weakest factors come from stored numbers and reasons only", () => {
  const e = explain({ demand: 9, competition: 9, speed: 7 }, { demand: "many buyers", competition: "crowded" }, CFG);
  assert.equal(e.strongest[0], "demand 9/10: many buyers");
  assert.equal(e.weakest[0], "competition 1/10: crowded");
  assert.ok(e.unknown.includes("retention"));
});

test("slugs and evidence normalization", () => {
  assert.equal(slugify("  AI Résumé Toolkit!! "), "ai-resume-toolkit");
  assert.equal(slugify("!"), null);
  const e = normalizeEvidence({ kind: "demand", claim: " 40k monthly searches ", source_url: "https://www.example.com/a?utm_source=x&q=1#top" }, NOW);
  assert.equal(e?.source_url, "https://www.example.com/a?q=1");
  assert.equal(e?.source_domain, "example.com");
  assert.equal(e?.claim, "40k monthly searches");
  assert.equal(normalizeEvidence({ kind: "rumor", claim: "x" }, NOW), null);
  assert.equal(normalizeEvidence({ kind: "demand", claim: "x", source_url: "javascript:alert(1)" }, NOW)?.source_url, null);
  assert.equal(normalizeEvidence({ kind: "demand", claim: "x", observed_at: "2099-01-01T00:00:00Z" }, NOW)?.observed_at, new Date(NOW).toISOString(), "future dates clamp to now");
});

test("store -> evidence -> proposal -> rescore -> rank, all scored in code", async () => {
  const fx = fakeDb();
  const a = await createOpportunity(fx.db, { name: "AI Resume Toolkit", category: "Digital Products", monetization: ["one-time sale"] });
  assert.ok("created" in a && a.created);
  const again = await createOpportunity(fx.db, { name: "ai resume  toolkit", category: "x" });
  assert.ok("created" in again && !again.created, "same slug is the same opportunity");
  assert.ok("error" in (await createOpportunity(fx.db, { name: "?", category: "x" })));
  const id = ("opportunity" in a ? a.opportunity.id : "") as string;

  const ev = [
    { kind: "demand", claim: "Search interest for AI resume tools", source_url: "https://trends.example/a" },
    { kind: "pricing", claim: "Competitors sell templates for $19-$49", source_url: "https://shop.example/p" },
    { kind: "competition", claim: "Several established tools exist", source_url: "https://review.example/r" },
  ];
  const r1 = await addEvidence(fx.db, id, ev, NOW);
  assert.deepEqual(r1, { added: 3, duplicates: 0, invalid: 0 });
  const r2 = await addEvidence(fx.db, id, [ev[0], { kind: "nope", claim: "x" }], NOW);
  assert.deepEqual(r2, { added: 0, duplicates: 1, invalid: 1 });

  const p = validateProposal({
    scores: { demand: 8, monetization: 7, speed: 8, competition: 6 },
    reasons: { demand: "steady search interest", monetization: "templates sell at $19-$49", speed: "a template pack ships in days", competition: "crowded" },
    validation_difficulty: 2, est_days_to_first_dollar: 7,
  });
  assert.ok(p.ok);
  if (p.ok) await applyProposal(fx.db, id, p.value, NOW);
  const row = fx.tables.opportunities[0];
  assert.equal(row.s_demand, 8);
  assert.equal(row.evidence_count, 3);
  assert.equal(row.evidence_domains, 3);
  assert.ok(Number(row.overall_score) > 0 && Number(row.confidence) > 0);

  await createOpportunity(fx.db, { name: "Unresearched idea", category: "micro-saas" });
  const ranked = await listRanked(fx.db);
  assert.equal(ranked[0].slug, "ai-resume-toolkit");
  assert.equal(ranked[1].overall, null, "unscored goes last");
  fx.tables.opportunities[1].status = "killed";
  assert.equal((await listRanked(fx.db)).length, 1, "killed hidden by default");
  assert.equal((await listRanked(fx.db, { status: "killed" })).length, 1);
});
