// Builds the AI Side Hustle Starter Kit ($12) and the free starter (tools list + 3 prompts): PDF + TXT each, a
// Gumroad listing sheet, and cover/preview PNGs. Uses the digital-products fonts, styles and Playwright install:
//   node ventures/ai-starter-kit/build.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { css, esc } from "../digital-products/lib.mjs";
import { CHECKLIST, KIT, STARTER, STORE, TOOLS } from "./kit.mjs";

const { chromium } = createRequire(new URL("../digital-products/package.json", import.meta.url))("playwright");
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
const count = KIT.sections.reduce((n, s) => n + s.prompts.length, 0);
const mark = (s) => esc(s).replace(/\[([^\]]+)\]/g, "<mark>[$1]</mark>");

const style = (palette) => `${css("letter", palette)}
@page { size: 8.5in 11in; margin: 0.6in 0.65in 0.6in; }
@page:first { margin: 0; }
.flow { font-size: 10pt; line-height: 1.5; }
.flow h2.sec { font: 400 20pt/1.1 "DM Serif Display", serif; border-bottom: 2.5pt solid var(--accent); padding-bottom: 5pt; margin: 18pt 0 10pt; break-after: avoid; }
.card { display: grid; grid-template-columns: 28pt 1fr; gap: 8pt; border: 0.75pt solid var(--rule); border-radius: 7pt; padding: 9pt 11pt; margin: 0 0 8pt; break-inside: avoid; }
.card .num { font: 400 15pt/1 "DM Serif Display", serif; color: var(--accent); }
.card h3 { margin: 0 0 3pt; font: 700 10pt/1.3 "Inter"; }
.card p { margin: 0; font-size: 9.5pt; color: #2f343c; }
mark { background: var(--tint); color: var(--ink); font-weight: 600; padding: 0 1.5pt; border-radius: 2pt; }
pre.ctx { white-space: pre-wrap; font: 9.5pt/1.55 "Inter"; background: var(--tint); border-radius: 7pt; padding: 11pt 13pt; margin: 6pt 0 12pt; break-inside: avoid; }
.tool { display: grid; grid-template-columns: 2.1in 1fr; gap: 8pt; padding: 5pt 0; border-bottom: 0.75pt solid var(--faint); break-inside: avoid; font-size: 9.5pt; }
.tool b { font-weight: 700; }
.step { font: 700 8pt Inter; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); margin: 12pt 0 2pt; }
.day { display: grid; grid-template-columns: 14pt 0.7in 1fr; gap: 8pt; align-items: start; padding: 8pt 0; border-bottom: 0.75pt solid var(--faint); break-inside: avoid; }
.day i { width: 11pt; height: 11pt; border: 1pt solid var(--accent); border-radius: 2pt; margin-top: 2pt; }
.cta { background: var(--tint); border-radius: 8pt; padding: 12pt 14pt; margin-top: 14pt; break-inside: avoid; }`;

const toolsHtml = () => `<h2 class="sec">Free AI tools for each step</h2>
<p>Every tool here has a free way to start. Plans, limits and fees change, so check each site before you rely on it.</p>
${TOOLS.map(([step, list]) => `<div class="step">${esc(step)}</div>${list.map(([n, d]) => `<div class="tool"><b>${esc(n)}</b><span>${esc(d)}</span></div>`).join("")}`).join("")}`;

const card = (k, [t, body]) => `<div class="card"><div class="num">${String(k).padStart(2, "0")}</div><div><h3>${esc(t)}</h3><p>${mark(body)}</p></div></div>`;
const howTo = (ctx) => `<h2 class="sec">How to use the prompts</h2>
<ol><li><b>Paste the starter context first.</b> Copy the block below into a new chat with ChatGPT, Claude or Gemini, replace everything in [BRACKETS] with your real details, and send it.</li>
<li><b>Pick a prompt, fill the brackets, send.</b> Highlighted <mark>[BRACKETS]</mark> are where your details go.</li>
<li><b>Check everything.</b> AI can be wrong. Check facts, prices and claims before you publish. These prompts tell the AI not to invent facts, but you are the final check.</li></ol>
<h3 style="font:700 10pt Inter;margin:12pt 0 0">Starter context (paste once per chat)</h3>
<pre class="ctx">${esc(ctx)}</pre>`;
const honest = `<p class="note" style="margin-top:14pt">This kit teaches a process. It does not promise income or results; what happens depends on your product, your work and your market. Written with the help of AI tools and reviewed by a person.</p>`;
const cover = (pill, title, sub, items, note) => `<section class="page cover"><div><div class="band"></div><div class="pill">${esc(pill)}</div><h1 style="margin-top:16pt">${esc(title)}</h1><div class="sub">${esc(sub)}</div></div>
<div><div style="font:700 8pt Inter;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin-bottom:8pt">Inside</div><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
<div class="note">${esc(note)}</div></section>`;
const wrap = (palette, title, inner) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${style(palette)}</style></head><body>${inner}</body></html>`;

function kitHtml() {
  let k = 0;
  const cards = KIT.sections.map((s) => `<h2 class="sec">${esc(s.name)}</h2>${s.prompts.map((p) => card(++k, p)).join("")}`).join("");
  return wrap(KIT.palette, KIT.title, `${cover(`AI prompt kit · ${count} prompts`, KIT.title, KIT.tagline,
    [...KIT.sections.map((s) => `${s.name} (${s.prompts.length} prompts)`), "Free AI tools for each step", "7-day launch checklist"],
    "Works with ChatGPT, Claude, Gemini and other AI chat assistants. For your own use; please do not resell or share the file.")}
<div class="flow">${howTo(KIT.context)}
<div class="checklist"><h2 class="sec">Your 7-day launch checklist</h2>${CHECKLIST.map(([d, t]) => `<div class="day"><i></i><b>${esc(d)}</b><span>${esc(t)}</span></div>`).join("")}</div>
${toolsHtml()}${cards}${honest}</div>`);
}

function starterHtml() {
  return wrap(STARTER.palette, STARTER.title, `${cover("Free download", STARTER.title, STARTER.tagline,
    ["Free AI tools for each step: plan, make, sell, get seen", ...STARTER.prompts.map(([t]) => `Prompt: ${t}`)],
    "Free to use for your own projects. Please share the link, not the file.")}
<div class="flow">${toolsHtml()}${howTo(KIT.context)}
<h2 class="sec">3 starter prompts</h2>${STARTER.prompts.map((p, i) => card(i + 1, p)).join("")}
<div class="cta"><b>Want the full process?</b> The AI Side Hustle Starter Kit has ${count} prompts for making, listing and posting your product, plus a 7-day checklist. Find it at ${esc(STORE.replace("https://", ""))}.</div>
${honest}</div>`);
}

function txt(title, tagline, ctx, groups, extra = []) {
  let k = 0;
  const out = [title.toUpperCase(), "", tagline, "", "STARTER CONTEXT (paste once per chat)", "-".repeat(40), ctx, "-".repeat(40)];
  for (const [name, prompts] of groups) {
    out.push("", `== ${name.toUpperCase()} ==`, "");
    for (const [t, b] of prompts) { k += 1; out.push(`${String(k).padStart(2, "0")}. ${t}`, b, ""); }
  }
  return [...out, ...extra, "", "This is a process, not a promise of income or results. Check AI output before you publish."].join("\n");
}

const listing = `GUMROAD LISTINGS: AI Side Hustle Starter Kit

1) FREE PRODUCT (publish first)
Name: ${STARTER.title}
Price: $0+ (pay what you want, minimum $0)
URL slug suggestion: free-ai-tools
Files: ${STARTER.slug}.pdf
Cover: pages/starter-cover.png
Summary: The free AI tools we use at each step of making and selling a small digital product, plus 3 prompts to pick your first idea and plan it.
Description:
${STARTER.tagline}

WHAT YOU GET
• Free AI tools for each step: plan, make, sell, get seen
• 3 copy-and-paste prompts: find ideas from what you already know, score them, and make a 20-day plan
• A starter context block so the AI uses your details

GOOD TO KNOW
• Free. Gumroad asks for an email to send the file.
• This is a process, not a promise of income or results.
• Written with the help of AI tools and reviewed by me.

2) PAID PRODUCT
Name: ${KIT.title}
Price: $12
URL slug suggestion: ai-starter-kit
Files: ${KIT.slug}.pdf + ${KIT.slug}.txt
Cover: pages/kit-cover.png  ·  extra images: pages/kit-card-1.png, pages/kit-card-2.png, pages/kit-checklist.png
Summary: ${count} fill-in-the-blank AI prompts to pick a small digital product, make it, list it and post about it in 7 days, plus a free tools list and a 7-day checklist.
Description:
${KIT.tagline}

WHAT YOU GET
• ${count} prompts in ${KIT.sections.length} sections: ${KIT.sections.map((s) => s.name.replace(/^\d+\. /, "")).join(", ")}
• A 7-day launch checklist
• Free AI tools for each step
• A starter context block you paste once, so every answer uses your details
• Every prompt tells the AI to use only facts you give it and never promise results
• PDF (easy to read) and TXT (easy to copy)

WHO IT'S FOR
${KIT.audience}.

GOOD TO KNOW
• Digital download, instant access.
• This kit teaches a process. It does not promise income or results.
• Works with ChatGPT, Claude, Gemini or any AI chat assistant.
• For your own use; please do not resell or share the files.
• Written with the help of AI tools and reviewed by me.

AFTER BOTH ARE LIVE
• In the free product's Gumroad "receipt" message, add: "Want the full ${count}-prompt kit? <paid product link>".
• Send both links to Claude to add to the bio links and captions.
`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
async function render(html, file, shots) {
  const p = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 2 });
  await p.setContent(html, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: file, width: "8.5in", height: "11in", printBackground: true, preferCSSPageSize: true });
  for (const [sel, n, f] of shots) await p.locator(sel).nth(n).screenshot({ path: f });
  await p.close();
}
mkdirSync(`${OUT}pages`, { recursive: true });
await render(kitHtml(), `${OUT}${KIT.slug}.pdf`, [["section.page", 0, `${OUT}pages/kit-cover.png`], [".card", 0, `${OUT}pages/kit-card-1.png`], [".card", 18, `${OUT}pages/kit-card-2.png`], [".checklist", 0, `${OUT}pages/kit-checklist.png`]]);
await render(starterHtml(), `${OUT}${STARTER.slug}.pdf`, [["section.page", 0, `${OUT}pages/starter-cover.png`]]);
writeFileSync(`${OUT}${KIT.slug}.txt`, txt(KIT.title, KIT.tagline, KIT.context, KIT.sections.map((s) => [s.name, s.prompts]), ["== 7-DAY CHECKLIST ==", ...CHECKLIST.map(([d, t]) => `[ ] ${d}: ${t}`), "", "== FREE AI TOOLS ==", ...TOOLS.flatMap(([s, l]) => [s, ...l.map(([n, d]) => `- ${n}: ${d}`)])]));
writeFileSync(`${OUT}gumroad-listings.txt`, listing);
await browser.close();
console.log(`kit: ${count} prompts; starter: ${STARTER.prompts.length} prompts`);
