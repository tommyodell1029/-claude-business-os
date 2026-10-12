// Free view-driver posts (owner 2026-10-12: "focus on content and generate more views"). Photo carousels built only
// from our real products: real prompts from the packs/kit and real planner page renders. No AI-generated visuals,
// no results or income claims. Each carousel renders as 1080x1350 slides (Instagram carousel, TikTok photo mode)
// and as a silent 1080x1920 slideshow MP4 for YouTube Shorts (add a sound in the app).
//   FFMPEG=<ffmpeg> node ventures/content/carousels.mjs [id]
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { css, esc } from "../digital-products/lib.mjs";
import { PACKS } from "../digital-products/prompts.mjs";
import { PLANNERS } from "../digital-products/planners.mjs";
import { LISTINGS } from "../digital-products/listings.mjs";
import { KIT, STARTER, TOOLS } from "../ai-starter-kit/kit.mjs";
import { SHORTS } from "./problem-shorts.mjs";

const { chromium } = createRequire(new URL("../digital-products/package.json", import.meta.url))("playwright");
const FF = process.env.FFMPEG ?? "ffmpeg";
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
const DP = fileURLToPath(new URL("../digital-products/out/", import.meta.url));
const pack = (slug) => PACKS.find((p) => p.slug === slug);
const prompt = (slug, title) => {
  const pk = slug === "kit" ? { sections: KIT.sections } : pack(slug);
  for (const s of pk.sections) for (const [t, b] of s.prompts) if (t === title) return [t, b];
  throw new Error(`no prompt ${slug}/${title}`);
};
const planner = (slug) => PLANNERS.find((p) => p.slug === slug);
const price = (slug) => LISTINGS[slug]?.price;
const pages = (slug, nums) => nums.map((n) => `${DP}planners/${slug}/pages/page-${String(n).padStart(2, "0")}.png`);

// slide kinds: hook | prompt | page | tools | cta
const C = [
  { id: "c01-etsy-tags", palette: pack("etsy-seller-prompts").palette, slides: [
    { k: "hook", t: "Stop guessing your 13 Etsy tags", s: "3 AI prompts I use for every listing. Save this." },
    { k: "prompt", p: prompt("etsy-seller-prompts", "All 13 tags") },
    { k: "prompt", p: prompt("etsy-seller-prompts", "Search-friendly title") },
    { k: "prompt", p: prompt("etsy-seller-prompts", "Long-tail keyword ideas") },
    { k: "cta", t: "30 prompts like these", s: "Etsy Seller AI Prompt Pack · $12 · link in bio" },
  ] },
  { id: "c02-review-replies", palette: pack("local-service-business-prompts").palette, slides: [
    { k: "hook", t: "Reply to every Google review in 30 seconds", s: "Copy these 3 prompts. Works with ChatGPT, Claude or Gemini." },
    { k: "prompt", p: prompt("local-service-business-prompts", "Reply to a 5-star review") },
    { k: "prompt", p: prompt("local-service-business-prompts", "Reply to a negative review") },
    { k: "prompt", p: prompt("local-service-business-prompts", "Review request text") },
    { k: "cta", t: "30 prompts for local service businesses", s: "$12 prompt pack · link in bio" },
  ] },
  { id: "c03-quote-followups", palette: pack("local-service-business-prompts").palette, slides: [
    { k: "hook", t: "Contractors: stop losing quotes you already sent", s: "3 prompts for the follow-up nobody has time to write." },
    { k: "prompt", p: prompt("local-service-business-prompts", "Missed-call text back") },
    { k: "prompt", p: prompt("local-service-business-prompts", "Quote follow-up sequence") },
    { k: "prompt", p: prompt("local-service-business-prompts", "Price objection reply") },
    { k: "cta", t: "30 prompts for local service businesses", s: "$12 prompt pack · link in bio" },
  ] },
  { id: "c04-realtor-listing", palette: pack("real-estate-agent-prompts").palette, slides: [
    { k: "hook", t: "Agents: give AI the fair housing rules before it writes your listing", s: "3 prompts. Your facts only." },
    { k: "prompt", p: prompt("real-estate-agent-prompts", "MLS listing description") },
    { k: "prompt", p: prompt("real-estate-agent-prompts", "Listing compliance check") },
    { k: "prompt", p: prompt("real-estate-agent-prompts", "Just listed post") },
    { k: "cta", t: "30 prompts for real estate agents", s: "$12 prompt pack · link in bio" },
  ] },
  { id: "c05-free-ai-tools", palette: KIT.palette, slides: [
    { k: "hook", t: "One free AI tool for each step", s: "Plan it, make it, sell it, get it seen. Save this." },
    ...TOOLS.map(([step, list]) => ({ k: "tools", t: step, list })),
    { k: "cta", t: "Free AI tools list + 3 starter prompts", s: "Free download · link in bio" },
  ] },
  { id: "c06-pick-one-idea", palette: KIT.palette, slides: [
    { k: "hook", t: "20 side hustle ideas and none started?", s: "3 prompts to pick ONE you can make this weekend." },
    ...STARTER.prompts.map((p) => ({ k: "prompt", p })),
    { k: "cta", t: "Get these 3 prompts free", s: "Plus the free AI tools list · link in bio" },
  ] },
  ...[
    ["teacher-lesson-planner", "Sunday night and the week isn't planned?", "The whole teaching week on one page. Sub sheet included.", [2, 3, 4]],
    ["adhd-college-planner", "Brain has 40 tabs open?", "Brain dump, pick 3, block your time. One planner.", [2, 3, 4]],
    ["family-command-center", "Who has practice tonight?", "The whole family week on one page for the fridge.", [2, 3, 4]],
    ["small-business-budget-kit", "Where did the money go this month?", "Plan it, track it, set taxes aside. On paper.", [2, 3, 4]],
    ["service-business-planner", "Lost another lead?", "Every call, quote and follow-up on one sheet.", [2, 3, 4]],
  ].map(([slug, t, s, nums], i) => ({ id: `c${String(7 + i).padStart(2, "0")}-${slug}`, palette: planner(slug).palette, slides: [
    { k: "hook", t, s },
    ...pages(slug, nums).map((f) => ({ k: "page", f })),
    { k: "cta", t: planner(slug).title, s: "Undated printable on Etsy · link in bio" },
  ] })),
];

// Free slide versions of the planner problem-first Shorts (S13-S27): the problem in their words -> the real planner
// page that fixes it -> the Linktree button. No AI imagery, so no credits.
const PSLUG = { "Teacher Weekly Lesson Planner": "teacher-lesson-planner", "ADHD-Friendly College Planner": "adhd-college-planner", "Family Weekly Command Center": "family-command-center",
  "Small Business Monthly Budget Kit": "small-business-budget-kit", "Service Business Weekly Planner": "service-business-planner" };
for (const sh of SHORTS.filter((x) => PSLUG[x.product])) {
  const slug = PSLUG[sh.product];
  const quote = /says[^:]*: "([^"]+)"/.exec(sh.video)?.[1] ?? sh.title;
  const page = Number(/page (\d+)/.exec(sh.output)?.[1] ?? 3);
  C.push({ id: `${sh.name.slice(0, 3).toLowerCase()}-${slug}`, palette: planner(slug).palette, short: true, slides: [
    { k: "hook", t: sh.title, s: `“${quote}”` },
    { k: "page", f: pages(slug, [page])[0] },
    { k: "cta", t: planner(slug).title, s: "Undated printable on Etsy · link in bio" },
  ] });
}

const mark = (s) => esc(s).replace(/\[([^\]]+)\]/g, "<mark>[$1]</mark>");
const img = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
function slideHtml(sl, n, total, H) {
  const tall = H > 1500;
  const foot = `<div class="foot"><span>@launchpadlocal</span><span>${n} / ${total}</span></div>`;
  if (sl.k === "hook") return `<div class="s hook"><div class="band"></div><h1>${esc(sl.t)}</h1><p>${esc(sl.s)}</p><div class="swipe">Swipe →</div>${foot}</div>`;
  if (sl.k === "prompt") {
    const fs = sl.p[1].length > 330 ? 33 : sl.p[1].length > 230 ? 37 : 42;
    return `<div class="s"><div class="kick">Copy this prompt</div><h2>${esc(sl.p[0])}</h2><div class="card" style="font-size:${fs}px">${mark(sl.p[1])}</div><div class="hint">Replace the <mark>[BRACKETS]</mark> with your details.</div>${foot}</div>`;
  }
  if (sl.k === "page") return `<div class="s pg"><img src="${img(sl.f)}" style="max-height:${tall ? 1500 : 1080}px">${foot}</div>`;
  if (sl.k === "tools") return `<div class="s"><div class="kick">${esc(sl.t)}</div>${sl.list.map(([n, d]) => `<div class="tool"><b>${esc(n)}</b><span>${esc(d)}</span></div>`).join("")}<div class="hint">Plans and fees change. Check each site.</div>${foot}</div>`;
  return `<div class="s cta"><div class="band"></div><h1>${esc(sl.t)}</h1><p>${esc(sl.s)}</p><div class="pill">Linktree in bio</div>${foot}</div>`;
}
const page = (palette, inner, W, H) => `<!doctype html><html><head><meta charset="utf-8"><style>${css("letter", palette)}
html,body{width:${W}px;height:${H}px;margin:0;overflow:hidden}
.s{position:absolute;inset:0;padding:${H > 1500 ? "210px 90px 200px" : "110px 90px 110px"};display:flex;flex-direction:column;justify-content:center;gap:34px;background:linear-gradient(160deg,var(--tint) 0%,#fff 75%);font-family:Inter;color:#1f232a}
.band{height:12px;width:180px;background:var(--accent);border-radius:6px}
.hook h1,.cta h1{font:400 92px/1.04 "DM Serif Display",serif;margin:0}
.hook p,.cta p{font-size:42px;line-height:1.35;color:#3c424c;margin:0}
.swipe{font:700 30px Inter;color:var(--accent);letter-spacing:.08em;text-transform:uppercase}
.kick{font:700 28px Inter;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
h2{font:400 64px/1.08 "DM Serif Display",serif;margin:0}
.card{background:#fff;border:3px solid var(--accent);border-radius:26px;padding:40px 44px;line-height:1.45;color:#23272f;box-shadow:0 20px 50px rgba(20,30,45,.10)}
mark{background:var(--tint);color:#1f232a;font-weight:700;padding:0 4px;border-radius:6px}
.hint{font-size:28px;color:#6b7280}
.pg{align-items:center}.pg img{max-width:100%;border-radius:12px;box-shadow:0 30px 70px rgba(20,30,45,.20)}
.tool{display:flex;flex-direction:column;gap:6px;background:#fff;border-radius:20px;padding:26px 30px;border:2px solid var(--faint)}
.tool b{font:700 36px Inter}.tool span{font-size:30px;line-height:1.35;color:#3c424c}
.pill{align-self:flex-start;font:700 32px Inter;color:#fff;background:var(--accent);border-radius:999px;padding:18px 34px}
.foot{position:absolute;left:90px;right:90px;bottom:${H > 1500 ? 120 : 56}px;display:flex;justify-content:space-between;font:600 24px Inter;color:#9aa1ab;letter-spacing:.06em}
</style></head><body>${inner}</body></html>`;

const only = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
for (const c of C) {
  if (only && !c.id.startsWith(only)) continue;
  const dir = `${OUT}${c.id}/`;
  mkdirSync(`${dir}tall`, { recursive: true });
  for (const [W, H, sub] of [[1080, 1350, ""], [1080, 1920, "tall/"]]) {
    const p = await browser.newPage({ viewport: { width: W, height: H } });
    for (const [i, sl] of c.slides.entries()) {
      await p.setContent(page(c.palette, slideHtml(sl, i + 1, c.slides.length, H), W, H), { waitUntil: "load" });
      await p.evaluate(() => document.fonts.ready);
      await p.screenshot({ path: `${dir}${sub}${String(i + 1).padStart(2, "0")}.png` });
    }
    await p.close();
  }
  // Shorts version: hook 3 s, every other slide 4 s, silent track so apps accept it
  const parts = c.slides.map((sl, i) => ({ f: `${dir}tall/${String(i + 1).padStart(2, "0")}.png`, d: i === 0 ? 3 : 4 }));
  const list = parts.map((x) => `file '${x.f}'\nduration ${x.d}`).join("\n") + `\nfile '${parts.at(-1).f}'`;
  writeFileSync(`${dir}tall/list.txt`, list);
  const total = parts.reduce((s, x) => s + x.d, 0);
  execFileSync(FF, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${dir}tall/list.txt`, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
    "-t", String(total), "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", `${dir}${c.id}-shorts.mp4`]);
  console.log(`${c.id}: ${c.slides.length} slides, ${total}s`);
}
await browser.close();
