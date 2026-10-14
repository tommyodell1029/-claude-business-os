// Second pass for website audits: load each audit_prepared prospect's homepage in a real browser (headless Chromium,
// one page per site, after the Python audit already confirmed robots.txt allows it) and drop any finding the rendered
// page contradicts (many builders add tel: links, forms or headings with JavaScript). Then recompute fit and stage.
// Only findings that survive both checks may be quoted in outreach.   node leadgen/verify_audit.mjs [--dry-run]
import { createRequire } from "node:module";
const { chromium } = createRequire(new URL("../.claude/skills/playwright-skill/package.json", import.meta.url))("playwright");
const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, ""), KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set"); process.exit(2); }
const dry = process.argv.includes("--dry-run");
const H = { apikey: KEY, ...(KEY.startsWith("eyJ") ? { Authorization: `Bearer ${KEY}` } : {}), "content-type": "application/json" };
const rest = async (method, path, body) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { ...H, Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`supabase ${method} ${r.status}`);
  return r.status === 204 ? [] : r.json();
};
const QUALIFY = 25;
const rows = await rest("GET", "prospects?pipeline_stage=eq.audit_prepared&website_audit->>status=eq.checked&select=id,name,phone,website_audit");
// Cloud sessions route HTTPS through the agent proxy, which re-terminates TLS with its own CA (it verifies the real
// site certificate upstream). Chromium is told to trust exactly that CA's key, as every other tool here is.
import { X509Certificate, createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
const CA = "/root/.ccr/agent-proxy-ca.crt";
const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {};
const args = existsSync(CA)
  ? [`--ignore-certificate-errors-spki-list=${createHash("sha256").update(new X509Certificate(readFileSync(CA)).publicKey.export({ type: "spki", format: "der" })).digest("base64")}`]
  : [];
const browser = await chromium.launch({ headless: true, args, ...proxy });
for (const p of rows) {
  const a = p.website_audit;
  if (a.verified_in_browser) continue;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) LaunchPadLocalBot/1.0 (+https://launchpadlocal.org)" });
  let dom = null;
  try {
    await page.goto(a.url, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(3000); // let builder scripts add phone links / forms
    dom = await page.evaluate(() => ({
      tel: document.querySelectorAll('a[href^="tel:"]').length,
      form: document.querySelectorAll("form, iframe[src*='form'], iframe[src*='book'], a[href*='book'], a[href*='schedule'], a[href*='quote']").length,
      h1: document.querySelectorAll("h1").length,
      viewport: !!document.querySelector('meta[name="viewport"]'),
      text: document.body.innerText.replace(/\D/g, ""),
    }));
  } catch (e) { console.log(`${p.name}: browser load failed (${e.name}); kept for manual check`); }
  await page.close();
  if (!dom) continue;
  const digits = String(p.phone ?? "").replace(/\D/g, "").slice(-10);
  const contradicted = { no_click_to_call: dom.tel > 0, no_form: dom.form > 0, no_h1: dom.h1 > 0, no_viewport: dom.viewport, phone_not_on_page: digits && dom.text.includes(digits) };
  const kept = a.findings.filter((f) => !contradicted[f.id]);
  const dropped = a.findings.filter((f) => contradicted[f.id]).map((f) => f.id);
  const fit = Math.min(100, kept.reduce((s, f) => s + f.weight, 0));
  const stage = fit >= QUALIFY ? "audit_prepared" : fit >= 10 ? "qualified" : "lost";
  const top = kept.sort((x, y) => y.weight - x.weight).slice(0, 3).map((f) => f.title.toLowerCase()).join(", ") || "no problems confirmed";
  console.log(`${String(fit).padStart(3)} ${stage.padEnd(15)} ${p.name.slice(0, 40).padEnd(40)} kept: ${kept.map((f) => f.id).join(",") || "-"} | dropped: ${dropped.join(",") || "-"}`);
  if (!dry) {
    await rest("PATCH", `prospects?id=eq.${p.id}`, {
      website_audit: { ...a, findings: kept, fit, verified_in_browser: new Date().toISOString(), dropped_after_render: dropped },
      website_fit: fit, pipeline_stage: stage,
      qualification_notes: `Website fit ${fit}/100 (checked in a real browser): ${top}.`,
      ...(stage === "lost" ? { outcome: "Not a fit for the website offer: the rendered homepage covers the basics." } : {}),
    });
  }
}
await browser.close();
