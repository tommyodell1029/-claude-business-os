// Vertical promo videos (1080x1920, TikTok/Reels/Shorts) for the two experiments. Every frame is built from the real
// product: real planner pages, the real prompts. Prompt videos fill the prompt with clearly labelled EXAMPLE details
// and show an example AI answer (labelled as such). Voiceovers were generated in ElevenLabs (voice "Maya") and are
// read from out/videos/audio/<id>.mp3. Needs Playwright + an ffmpeg binary (FFMPEG env var).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { css, esc } from "./lib.mjs";
import { PLANNERS } from "./planners.mjs";
import { PACKS } from "./prompts.mjs";
import { LISTINGS } from "./listings.mjs";

const OUT = fileURLToPath(new URL("./out/videos/", import.meta.url));
const FF = process.env.FFMPEG ?? "ffmpeg";
const W = 1080, H = 1920, FPS = 30;
const b64 = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
function audioSeconds(f) {
  try { execFileSync(FF, ["-hide_banner", "-i", f], { stdio: "pipe" }); } catch (e) {
    const m = String(e.stderr).match(/Duration: (\d+):(\d+):([\d.]+)/);
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  throw new Error(`cannot read duration of ${f}`);
}

const pack = (slug) => PACKS.find((p) => p.slug === slug);
const prompt = (slug, n) => pack(slug).sections.flatMap((s) => s.prompts)[n - 1];

const PROMPT_VIDEOS = [
  {
    id: "V1", slug: "local-service-business-prompts", n: 6, hook: "Hate writing review replies?",
    filled: 'Write a reply to this 5-star review from Dana: "Mike came out the same day our AC quit in July, explained what was wrong and had it running in an hour. Fair price too." Thank them by first name, mention the specific job they described, and keep it under 60 words. Do not offer discounts. Give 3 versions that do not sound templated.',
    answer: [
      "1. Thanks so much, Dana! A dead AC in July is no joke, and we're glad Mike could get out to you the same day and have you cool again within the hour. We appreciate you trusting us with it.",
      "2. Dana, thank you for taking the time to write this. Mike will be happy to hear it. Same-day AC repairs in July are exactly what we're here for. Stay cool, and call us anytime.",
      "3. We really appreciate this, Dana. Getting your AC running again within an hour on a July day was a team win, and we're glad Mike explained everything clearly. Thanks for choosing us!",
    ],
  },
  {
    id: "V2", slug: "real-estate-agent-prompts", n: 1, hook: "Agents: AI listings without the fair housing risk",
    filled: "Write an MLS description for this home using only these facts: 3 beds, 2 baths, 1,640 sq ft, 0.24-acre lot, built 1998, new roof 2023, kitchen updated with quartz counters, fenced backyard, screened porch, no HOA. Lead with the strongest real feature, keep to 500 characters, no exaggerations, fair-housing compliant. Give 2 versions.",
    answer: [
      "1. Updated 3-bedroom, 2-bath home with a new roof (2023) and a renovated kitchen with quartz counters. The 1,640 sq ft layout opens to a screened porch overlooking a fully fenced backyard on a 0.24-acre lot. Built in 1998, with no HOA.",
      "2. A new roof in 2023 and a quartz-counter kitchen update set this 3-bed, 2-bath, 1,640 sq ft home apart. Relax on the screened porch, enjoy the fenced 0.24-acre yard, and skip the HOA fees. Built 1998.",
    ],
  },
  {
    id: "V3", slug: "etsy-seller-prompts", n: 2, hook: "All 13 Etsy tags in one prompt",
    filled: "Give me 13 Etsy tags (each max 20 characters, multi-word phrases where possible) for an undated printable teacher lesson planner (PDF: weekly lesson grid, grading tracker, sub sheet). Mix: what it is, who it is for, occasion, style, and use. No repeated words across more than 3 tags. Output as a comma-separated list.",
    answer: ["teacher planner, lesson plan template, lesson planner, teacher printable, undated planner, grading tracker, parent contact log, substitute binder, sub plans, teacher binder, weekly planner pdf, classroom planner, teacher gift"],
  },
];

const PLANNER_VIDEOS = PLANNERS.map((pl, i) => ({ id: `P${i + 1}`, pl, L: LISTINGS[pl.slug] }));

const shell = (palette, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css("letter", palette)}
html,body{width:${W}px;height:${H}px;margin:0;overflow:hidden}
.c{position:absolute;inset:0;background:linear-gradient(165deg,var(--tint) 0%,#fff 65%);font-family:Inter;color:#1f232a}
.h{font:400 1em/1.05 "DM Serif Display",serif;margin:0}
.chip{display:inline-block;font:700 30px Inter;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);border:4px solid var(--accent);border-radius:999px;padding:12px 26px}
.card{background:#fff;border-radius:34px;box-shadow:0 30px 80px rgba(20,30,45,.14);padding:56px 54px}
.lbl{font:700 28px Inter;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:22px}
.paper{background:#fff;box-shadow:0 40px 100px rgba(20,30,45,.22);border-radius:10px;display:block}
.bar{position:absolute;left:0;right:0;bottom:0;height:170px;background:var(--accent);color:#fff;font:700 46px Inter;display:flex;align-items:center;justify-content:center}
</style></head><body><div class="c">${body}</div></body></html>`;

async function still(browser, html, file, height = H) {
  const p = await browser.newPage({ viewport: { width: W, height }, deviceScaleFactor: 2 });
  await p.setContent(html, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: file, fullPage: height !== H });
  await p.close();
}

/** One scene -> mp4 segment. Gentle zoom for normal scenes; tall images scroll top to bottom instead. */
function segment(png, seconds, file, { scroll = false } = {}) {
  const frames = Math.max(1, Math.round(seconds * FPS));
  const fade = `fade=t=in:st=0:d=0.25,fade=t=out:st=${Math.max(0, seconds - 0.25).toFixed(2)}:d=0.25`;
  const vf = scroll
    ? `scale=${W}:-2,crop=${W}:${H}:0:'min(ih-${H}\\,max(0\\,(t-0.8)/${Math.max(0.1, seconds - 1.8).toFixed(2)}*(ih-${H})))',${fade},format=yuv420p`
    : `zoompan=z='min(1+0.0006*on\\,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},${fade},format=yuv420p`;
  execFileSync(FF, ["-y", "-loglevel", "error", "-loop", "1", "-framerate", String(FPS), "-i", png, "-t", seconds.toFixed(2), "-vf", vf, "-r", String(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "20", file]);
}

function assemble(segs, audio, file) {
  const list = `${file}.txt`;
  execFileSync("bash", ["-c", `printf "${segs.map((s) => `file '${s}'`).join("\\n")}\\n" > '${list}'`]);
  execFileSync(FF, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-i", audio, "-c:v", "copy", "-af", "apad", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", file]);
  rmSync(list);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const only = process.argv[2];

for (const v of PROMPT_VIDEOS) {
  if (only && only !== v.id) continue;
  const audio = `${OUT}audio/${v.id}.mp3`;
  if (!existsSync(audio)) { console.log(`${v.id}: no voiceover yet, skipped`); continue; }
  const pk = pack(v.slug);
  const tmp = `${OUT}tmp/${v.id}`; mkdirSync(tmp, { recursive: true });
  const [title] = prompt(v.slug, v.n);
  const total = audioSeconds(audio) + 0.7;
  await still(browser, shell(pk.palette, `
    <div style="position:absolute;left:90px;right:90px;top:520px">
      <div class="chip">${esc(pk.short)}</div>
      <h1 class="h" style="font-size:118px;margin-top:50px">${esc(v.hook)}</h1>
      <p style="font-size:44px;line-height:1.4;color:#3c424c;margin-top:40px">Copy this prompt into ChatGPT, Claude or Gemini.</p>
    </div>`), `${tmp}/1.png`);
  await still(browser, shell(pk.palette, `
    <div style="position:absolute;left:70px;right:70px;top:50%;transform:translateY(-55%)">
      <div class="lbl">The prompt · ${esc(title)}</div>
      <div class="card" style="font-size:44px;line-height:1.45">${esc(v.filled)}</div>
      <p style="font-size:30px;color:#5b6370;margin-top:26px">Example details shown. In the pack, you fill in [BRACKETS] with yours.</p>
    </div>`), `${tmp}/2.png`);
  await still(browser, shell(pk.palette, `
    <div style="position:absolute;left:70px;right:70px;top:50%;transform:translateY(-55%)">
      <div class="lbl">Example AI answer</div>
      <div class="card" style="font-size:42px;line-height:1.5">${v.answer.map((a) => `<p style="margin:0 0 30px">${esc(a)}</p>`).join("")}</div>
    </div>`), `${tmp}/3.png`, H);
  const cover = `${fileURLToPath(new URL(`./out/prompts/${v.slug}/pages/cover.png`, import.meta.url))}`;
  await still(browser, shell(pk.palette, `
    <div style="position:absolute;left:90px;right:90px;top:170px;text-align:center">
      <h1 class="h" style="font-size:96px">30 prompts like this</h1>
      <p style="font-size:44px;color:#3c424c;margin-top:24px">${esc(pk.title)}</p>
    </div>
    <img class="paper" src="${b64(cover)}" style="position:absolute;width:700px;left:190px;top:560px;transform:rotate(-2deg)">
    <div class="bar">$12 · Link in bio</div>`), `${tmp}/4.png`);
  const t1 = 2.6, t2 = 5.4, t4 = 4.6, t3 = Math.max(4, total - t1 - t2 - t4);
  const segs = [[1, t1], [2, t2], [3, t3], [4, t4]].map(([n, s]) => { const f = `${tmp}/${n}.mp4`; segment(`${tmp}/${n}.png`, s, f); return f; });
  assemble(segs, audio, `${OUT}${v.id}-${v.slug}.mp4`);
  console.log(`${v.id} done (${total.toFixed(1)}s)`);
}

for (const v of PLANNER_VIDEOS) {
  if (only && only !== v.id) continue;
  const audio = `${OUT}audio/${v.id}.mp3`;
  if (!existsSync(audio)) { console.log(`${v.id}: no voiceover yet, skipped`); continue; }
  const { pl, L } = v;
  const tmp = `${OUT}tmp/${v.id}`; mkdirSync(tmp, { recursive: true });
  const pagesDir = fileURLToPath(new URL(`./out/planners/${pl.slug}/pages/`, import.meta.url));
  const pages = readdirSync(pagesDir).sort().map((f) => `${pagesDir}${f}`);
  const total = audioSeconds(audio) + 0.7;
  await still(browser, shell(pl.palette, `
    <div style="position:absolute;left:90px;right:90px;top:460px">
      <div class="chip">Printable · Undated</div>
      <h1 class="h" style="font-size:120px;margin-top:50px">${esc(pl.title)}</h1>
      <p style="font-size:46px;line-height:1.4;color:#3c424c;margin-top:40px">${esc(L.heroLine)}</p>
    </div>`), `${tmp}/1.png`);
  const show = [...new Set([...L.heroPages, L.detailPage])].slice(0, 3);
  for (const [k, idx] of show.entries()) {
    await still(browser, shell(pl.palette, `
      <div class="lbl" style="position:absolute;left:80px;top:150px;font-size:34px">${esc(pl.pages[idx].name)}</div>
      <img class="paper" src="${b64(pages[idx])}" style="position:absolute;width:960px;left:60px;top:240px">`), `${tmp}/p${k}.png`);
  }
  await still(browser, shell(pl.palette, `
    <div style="position:absolute;left:90px;right:90px;top:200px;text-align:center">
      <h1 class="h" style="font-size:100px">${esc(pl.title)}</h1>
      <p style="font-size:44px;color:#3c424c;margin-top:30px">${pl.pages.length - 1} printable pages · US Letter + A4</p>
    </div>
    <img class="paper" src="${b64(pages[0])}" style="position:absolute;width:640px;left:220px;top:640px;transform:rotate(-2deg)">
    <div class="bar">On Etsy · Link in bio</div>`), `${tmp}/5.png`);
  const t1 = 3, t5 = 4, tp = Math.max(2.5, (total - t1 - t5) / show.length);
  const segs = [];
  const add = (png, s) => { const f = png.replace(/\.png$/, ".mp4"); segment(png, s, f); segs.push(f); };
  add(`${tmp}/1.png`, t1);
  show.forEach((_, k) => add(`${tmp}/p${k}.png`, tp));
  add(`${tmp}/5.png`, t5);
  assemble(segs, audio, `${OUT}${v.id}-${pl.slug}.mp4`);
  console.log(`${v.id} done (${total.toFixed(1)}s)`);
}

await browser.close();
