import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { addonPrice, availableAddons, cancellationText, foundingOpen, loadOfferings, usd } from "./offerings.ts";
import { demoPhone } from "./phone.ts";

test("committed copy matches config/offerings.yaml (run npm run build to resync)", () => {
  const src = new URL("../../config/offerings.yaml", import.meta.url);
  if (!existsSync(src)) return;
  assert.equal(readFileSync(new URL("../content/offerings.yaml", import.meta.url), "utf8"), readFileSync(src, "utf8"));
});

test("only available add-ons are listed", () => {
  const o = loadOfferings();
  const keys = availableAddons(o).map(([k]) => k);
  assert.ok(keys.length > 0);
  for (const [k, a] of Object.entries(o.addons)) assert.equal(keys.includes(k), a.available === true, k);
});

test("price formatting", () => {
  assert.equal(usd(497), "$497");
  assert.equal(usd(0.25), "$0.25");
  assert.equal(addonPrice({ setup: 199, monthly: 49 }), "$199 setup + $49/mo");
  assert.equal(addonPrice({ one_time: 199 }), "$199 one-time");
  assert.equal(usd(1497), "$1,497");
});

test("founding flag follows pricing_phase and cancellation email is substituted", () => {
  const o = loadOfferings();
  assert.equal(foundingOpen(o), o.pricing_phase.founding_clients_signed < o.pricing_phase.founding_client_limit);
  assert.ok(cancellationText(o).includes(o.terms.cancellation_email));
  assert.ok(!cancellationText(o).includes("{"));
});

test("demo phone is hidden unless SHOW_DEMO_PHONE=true and the number is valid", () => {
  assert.equal(demoPhone({ DEMO_PHONE: "+19045550100" }), null);
  assert.equal(demoPhone({ DEMO_PHONE: "+19045550100", SHOW_DEMO_PHONE: "false" }), null);
  assert.equal(demoPhone({ SHOW_DEMO_PHONE: "true" }), null);
  assert.equal(demoPhone({ DEMO_PHONE: "123", SHOW_DEMO_PHONE: "true" }), null);
  assert.deepEqual(demoPhone({ DEMO_PHONE: "+19045550100", SHOW_DEMO_PHONE: "TRUE" }), { display: "(904) 555-0100", tel: "+19045550100" });
});
