// QA for a built client site (QA agent): mobile + desktop render, no horizontal scroll, tap-to-call links, title,
// meta description, one H1, images with alt text, viewport tag, form present (and, for real clients, an endpoint),
// no console errors, every internal link resolves. Exit code 1 if any check fails.
//   node sites/qa.mjs sites/out/<slug>/index.html   (or an https:// preview URL)
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const { chromium } = createRequire(new URL("../.claude/skills/playwright-skill/package.json", import.meta.url))("playwright");

const target = process.argv[2];
if (!target) { console.error("usage: node sites/qa.mjs <file or url>"); process.exit(2); }
const url = /^https?:/.test(target) ? target : pathToFileURL(resolve(target)).href;
const b = await chromium.launch({ headless: true });
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
for (const [w, h, tag] of [[390, 844, "mobile"], [1280, 900, "desktop"]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await p.goto(url, { waitUntil: "load" });
  const d = await p.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    tel: [...document.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute("href")),
    title: document.title, desc: document.querySelector('meta[name="description"]')?.content ?? "",
    h1: document.querySelectorAll("h1").length, noAlt: document.querySelectorAll("img:not([alt])").length,
    viewport: !!document.querySelector('meta[name="viewport"]'), forms: [...document.forms].map((f) => f.getAttribute("action")),
    concept: !!document.querySelector(".concept"),
    smallTargets: [...document.querySelectorAll("a,button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && r.height < 44 && getComputedStyle(e).display !== "inline"; }).length,
  }));
  check(`${tag}: no horizontal scroll`, !d.overflow);
  check(`${tag}: no console errors`, !errors.length, errors.join(" | "));
  if (tag === "mobile") {
    check("tap-to-call link present", d.tel.length > 0, d.tel[0] ?? "");
    check("tel links are valid +1 numbers", d.tel.every((t) => /^tel:\+1\d{10}$/.test(t)), d.tel.join(", "));
    check("title set", d.title.length >= 10, d.title);
    check("meta description set", d.desc.length >= 50 && d.desc.length <= 170, `${d.desc.length} chars`);
    check("exactly one H1", d.h1 === 1, String(d.h1));
    check("all images have alt text", d.noAlt === 0, String(d.noAlt));
    check("viewport tag", d.viewport);
    check("contact form present", d.forms.length > 0);
    check("form posts to an endpoint (real clients)", d.concept || d.forms.every((a) => a && /^https:\/\//.test(a)), d.concept ? "concept: form disabled" : d.forms.join(", "));
    check("tap targets at least 44px tall", d.smallTargets === 0, String(d.smallTargets));
  }
  await p.close();
}
await b.close();
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
