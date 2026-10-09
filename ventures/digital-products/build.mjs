// Builds every sellable file and listing image from the definitions in planners.mjs and prompts.mjs.
// Needs Playwright with Chromium: `NODE_PATH=<dir with playwright> node build.mjs [planners|prompts|images|all]`.
// Output goes to ./out (products to upload as the digital file, images to upload as listing photos).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PAPER, css, doc, esc } from "./lib.mjs";
import { PLANNERS } from "./planners.mjs";
import { PACKS, promptCount } from "./prompts.mjs";
import { GUMROAD, LISTINGS, gumroadDescription } from "./listings.mjs";
import { PLANS, pick } from "./plans.mjs";

const OUT = fileURLToPath(new URL("./out/", import.meta.url));
const what = process.argv[2] ?? "all";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });

async function pdf(html, file, paper) {
  const p = await browser.newPage();
  await p.setContent(html, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: file, width: PAPER[paper].w, height: PAPER[paper].h, printBackground: true, preferCSSPageSize: true });
  await p.close();
}

/** PNG of each page (US Letter) at print-ish resolution, used for listing images. */
async function pagePngs(html, dir, scale = 2) {
  const p = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: scale });
  await p.setContent(html, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  const n = await p.locator("section.page").count();
  const files = [];
  for (let i = 0; i < n; i++) {
    const f = `${dir}/page-${String(i + 1).padStart(2, "0")}.png`;
    await p.locator("section.page").nth(i).screenshot({ path: f });
    files.push(f);
  }
  await p.close();
  return files;
}

if (what === "planners" || what === "all") {
  for (const pl of PLANNERS) {
    const dir = `${OUT}planners/${pl.slug}`;
    mkdirSync(`${dir}/pages`, { recursive: true });
    const body = (paper) => pl.pages.map((x) => x.html()).join("");
    for (const paper of ["letter", "a4"]) {
      const html = doc(paper, pl.palette, body(paper), pl.title);
      await pdf(html, `${dir}/${pl.slug}-${paper === "letter" ? "US-Letter" : "A4"}.pdf`, paper);
    }
    await pagePngs(doc("letter", pl.palette, body("letter"), pl.title), `${dir}/pages`);
    console.log(`planner ${pl.slug}: ${pl.pages.length} pages`);
  }
}

// ---------------------------------------------------------------- prompt packs: PDF (designed) + TXT (easy copy)
function packHtml(pk) {
  const n = promptCount(pk);
  let k = 0;
  const cards = pk.sections.map((sec) => `<h2 class="sec">${esc(sec.name)}</h2>${sec.prompts.map(([t, body]) => {
    k += 1;
    const html = esc(body).replace(/\[([^\]]+)\]/g, '<mark>[$1]</mark>');
    return `<div class="card"><div class="num">${String(k).padStart(2, "0")}</div><div><h3>${esc(t)}</h3><p>${html}</p></div></div>`;
  }).join("")}`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(pk.title)}</title><style>${css("letter", pk.palette)}
@page { size: 8.5in 11in; margin: 0.6in 0.65in 0.6in; }
@page:first { margin: 0; }
.flow { font-size: 10pt; line-height: 1.5; }
.flow h2.sec { font: 400 20pt/1.1 "DM Serif Display", serif; border-bottom: 2.5pt solid var(--accent); padding-bottom: 5pt; margin: 18pt 0 10pt; break-after: avoid; }
.card { display: grid; grid-template-columns: 28pt 1fr; gap: 8pt; border: 0.75pt solid var(--rule); border-radius: 7pt; padding: 9pt 11pt; margin: 0 0 8pt; break-inside: avoid; }
.card .num { font: 400 15pt/1 "DM Serif Display", serif; color: var(--accent); }
.card h3 { margin: 0 0 3pt; font: 700 10pt/1.3 "Inter"; }
.card p { margin: 0; font-size: 9.5pt; color: #2f343c; }
mark { background: var(--tint); color: var(--ink); font-weight: 600; padding: 0 1.5pt; border-radius: 2pt; }
pre.ctx { white-space: pre-wrap; font: 9.5pt/1.55 "Inter"; background: var(--tint); border-radius: 7pt; padding: 11pt 13pt; margin: 6pt 0 12pt; }
.toc { columns: 2; font-size: 10pt; line-height: 1.8; padding-left: 16pt; }
</style></head><body>
<section class="page cover"><div><div class="band"></div><div class="pill">AI prompt pack · ${n} prompts</div><h1 style="margin-top:16pt">${esc(pk.title)}</h1><div class="sub">${esc(pk.tagline)}</div></div>
<div><div style="font:700 8pt Inter;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin-bottom:8pt">Sections</div><ul>${pk.sections.map((x) => `<li>${esc(x.name)} (${x.prompts.length})</li>`).join("")}</ul></div>
<div class="note">Works with ChatGPT, Claude, Gemini and other AI chat assistants. For your own business use; please do not resell or share the file.</div></section>
<div class="flow">
<h2 class="sec">How to use this pack</h2>
<ol><li><b>Paste the starter context first.</b> Copy the block below into a new chat, replace everything in [BRACKETS] with your real details, and send it. The AI will then write in your voice for the rest of the chat.</li>
<li><b>Pick a prompt, fill the brackets, send.</b> Highlighted <mark>[BRACKETS]</mark> are where your details go. The more specific you are, the better the result.</li>
<li><b>Edit before you publish.</b> AI can be wrong. Check every fact, price, date and claim. These prompts tell the AI not to invent facts, but you are the final check.</li>
<li><b>Ask for changes.</b> "Shorter", "warmer", "more like this example: …" all work well as follow-ups.</li></ol>
<h3 style="font:700 10pt Inter;margin:12pt 0 0">Starter context (paste once per chat)</h3>
<pre class="ctx">${esc(pk.context)}</pre>
${cards}
</div></body></html>`;
}

function packTxt(pk) {
  let k = 0;
  const lines = [pk.title.toUpperCase(), "", pk.tagline, "", "HOW TO USE", "1. Paste the starter context into a new AI chat, fill in the [BRACKETS], send.", "2. Pick a prompt, replace the [BRACKETS] with your details, send.", "3. Check every fact before you publish.", "", "STARTER CONTEXT (paste once per chat)", "-".repeat(40), pk.context, "-".repeat(40), ""];
  for (const sec of pk.sections) {
    lines.push("", `== ${sec.name.toUpperCase()} ==`, "");
    for (const [t, body] of sec.prompts) { k += 1; lines.push(`${String(k).padStart(2, "0")}. ${t}`, body, ""); }
  }
  lines.push("", "For your own business use. Please do not resell or share this file.");
  return lines.join("\n");
}

if (what === "prompts" || what === "all") {
  for (const pk of PACKS) {
    const dir = `${OUT}prompts/${pk.slug}`;
    mkdirSync(`${dir}/pages`, { recursive: true });
    const html = packHtml(pk);
    const p = await browser.newPage();
    await p.setContent(html, { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    await p.pdf({ path: `${dir}/${pk.slug}.pdf`, width: "8.5in", height: "11in", printBackground: true, preferCSSPageSize: true });
    await p.close();
    writeFileSync(`${dir}/${pk.slug}.txt`, packTxt(pk));
    // previews for listing images: cover page + first prompts, rendered as a screen page
    const v = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 2 });
    await v.setContent(html, { waitUntil: "load" });
    await v.evaluate(() => document.fonts.ready);
    await v.locator("section.page").first().screenshot({ path: `${dir}/pages/cover.png` });
    await v.locator(".card").nth(0).screenshot({ path: `${dir}/pages/card-1.png` });
    await v.locator(".card").nth(6).screenshot({ path: `${dir}/pages/card-2.png` });
    await v.locator(".card").nth(12).screenshot({ path: `${dir}/pages/card-3.png` });
    await v.close();
    console.log(`prompt pack ${pk.slug}: ${promptCount(pk)} prompts`);
  }
}

// ---------------------------------------------------------------- listing images (real page renders only)
const b64 = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
async function shot(html, file, w, h) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.setContent(html, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: file, type: "jpeg", quality: 90 });
  await p.close();
}
const shell = (palette, body, extra = "") => `<!doctype html><html><head><meta charset="utf-8"><style>${css("letter", palette)}
html,body{width:100%;height:100%;overflow:hidden}
.canvas{position:absolute;inset:0;background:linear-gradient(150deg,var(--tint) 0%,#ffffff 70%);font-family:Inter}
.paper{background:#fff;box-shadow:0 30px 80px rgba(20,30,45,.18),0 4px 14px rgba(20,30,45,.08);border-radius:6px;display:block}
.h{font:400 1em/1.02 "DM Serif Display",serif;color:#1f232a;margin:0}
.chip{display:inline-block;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);border:3px solid var(--accent);border-radius:999px;padding:.45em 1em;margin:0 .5em .6em 0}
${extra}</style></head><body><div class="canvas">${body}</div></body></html>`;

if (what === "images" || what === "all") {
  for (const pl of PLANNERS) {
    const L = LISTINGS[pl.slug];
    const dir = `${OUT}planners/${pl.slug}`;
    const imgDir = `${OUT}listing-images/etsy/${pl.slug}`;
    mkdirSync(imgDir, { recursive: true });
    const pages = readdirSync(`${dir}/pages`).sort().map((f) => `${dir}/pages/${f}`);
    const W = 2700, H = 2025;
    const feat = L.heroPages.map((i) => pages[i]);
    // 1. hero
    await shot(shell(pl.palette, `
      <div style="position:absolute;left:150px;top:50%;transform:translateY(-50%);width:1150px">
        <div style="font-size:34px">${["Printable PDF", "Undated", "US Letter + A4"].map((c) => `<span class="chip">${c}</span>`).join("")}</div>
        <h1 class="h" style="font-size:132px;margin-top:40px">${esc(pl.title)}</h1>
        <p style="font-size:46px;line-height:1.4;color:#3c424c;margin-top:44px">${esc(L.heroLine)}</p>
        <p style="font-size:40px;font-weight:700;color:var(--accent);margin-top:50px">${pl.pages.length} pages · instant download</p>
      </div>
      <img class="paper" src="${b64(feat[1])}" style="position:absolute;width:820px;left:1480px;top:330px;transform:rotate(-6deg)">
      <img class="paper" src="${b64(feat[2])}" style="position:absolute;width:820px;left:1760px;top:420px;transform:rotate(5deg)">
      <img class="paper" src="${b64(feat[0])}" style="position:absolute;width:860px;left:1600px;top:260px">`), `${imgDir}/01-hero.jpg`, W, H);
    // 2. everything inside
    const thumbs = pages.slice(1);
    const cols = thumbs.length > 8 ? 5 : 4;
    await shot(shell(pl.palette, `
      <h1 class="h" style="position:absolute;left:150px;top:110px;font-size:100px">What's inside</h1>
      <p style="position:absolute;left:150px;top:250px;font-size:40px;color:#3c424c">${thumbs.length} printable pages plus a cover · every page shown is in the file</p>
      <div style="position:absolute;left:150px;right:150px;top:370px;display:grid;grid-template-columns:repeat(${cols},1fr);gap:46px 50px">
        ${thumbs.map((f, i) => `<figure style="margin:0"><img class="paper" src="${b64(f)}" style="width:100%"><figcaption style="font-size:30px;font-weight:600;margin-top:18px;color:#2a2f37">${esc(pl.pages[i + 1].name)}</figcaption></figure>`).join("")}
      </div>`), `${imgDir}/02-whats-inside.jpg`, W, H + (thumbs.length > cols * 2 ? 0 : 0));
    // 3. close-up of the key page
    await shot(shell(pl.palette, `
      <img class="paper" src="${b64(pages[L.detailPage])}" style="position:absolute;height:1800px;left:150px;top:112px">
      <div style="position:absolute;left:1640px;top:220px;width:900px">
        <div style="font-size:30px"><span class="chip">Close-up</span></div>
        <h1 class="h" style="font-size:96px;margin:30px 0 50px">${esc(pl.pages[L.detailPage].name)}</h1>
        <ul style="font-size:44px;line-height:1.5;padding-left:44px;color:#2a2f37">${L.detailPoints.map((x) => `<li style="margin-bottom:26px">${esc(x)}</li>`).join("")}</ul>
      </div>`), `${imgDir}/03-close-up.jpg`, W, H);
    // 4. how it works
    await shot(shell(pl.palette, `
      <h1 class="h" style="position:absolute;left:150px;top:150px;font-size:110px">How it works</h1>
      <div style="position:absolute;left:150px;right:150px;top:430px;display:grid;grid-template-columns:repeat(3,1fr);gap:70px">
        ${[["1", "Download", "Your PDFs are ready right after purchase in your Etsy account under Purchases."], ["2", "Print", "Print at home or at any print shop. Both US Letter and A4 are included."], ["3", "Reuse", "Undated pages: print the weekly and daily pages again whenever you need them."]].map(([n, t, d]) => `
          <div style="background:#fff;border-radius:28px;padding:70px 60px;box-shadow:0 20px 60px rgba(20,30,45,.10)">
            <div class="h" style="font-size:120px;color:var(--accent)">${n}</div>
            <div style="font-size:64px;font-weight:700;margin:20px 0 26px">${t}</div>
            <div style="font-size:40px;line-height:1.45;color:#3c424c">${d}</div></div>`).join("")}
      </div>
      <p style="position:absolute;left:150px;right:150px;bottom:150px;font-size:38px;line-height:1.5;color:#4b5260">This is a digital download: no physical item will be shipped. Personal use only. Colors may look slightly different on your printer.</p>`), `${imgDir}/04-how-it-works.jpg`, W, H);
    console.log(`etsy images ${pl.slug}: 4`);
  }
  for (const pk of PACKS) {
    const dir = `${OUT}prompts/${pk.slug}`;
    const imgDir = `${OUT}listing-images/gumroad/${pk.slug}`;
    mkdirSync(imgDir, { recursive: true });
    const n = promptCount(pk);
    const cover = `${dir}/pages/cover.png`;
    const cards = [1, 2, 3].map((i) => `${dir}/pages/card-${i}.png`);
    // cover 1280x720
    await shot(shell(pk.palette, `
      <div style="position:absolute;left:70px;top:80px;width:640px">
        <div style="font-size:17px">${[`${n} prompts`, "PDF + TXT", "Any AI chat"].map((c) => `<span class="chip" style="border-width:2px">${c}</span>`).join("")}</div>
        <h1 class="h" style="font-size:62px;margin-top:22px">${esc(pk.title)}</h1>
        <p style="font-size:22px;line-height:1.45;color:#3c424c;margin-top:22px">${esc(pk.audience)}. Fill in the brackets, paste, done.</p>
      </div>
      <img class="paper" src="${b64(cover)}" style="position:absolute;width:390px;left:820px;top:70px;transform:rotate(3deg)">`), `${imgDir}/cover-1280x720.jpg`, 1280, 720);
    // preview: real prompt cards
    await shot(shell(pk.palette, `
      <h1 class="h" style="position:absolute;left:70px;top:46px;font-size:48px">A look inside</h1>
      <p style="position:absolute;left:70px;top:112px;font-size:20px;color:#3c424c">Three of the ${n} prompts, exactly as they appear in the pack</p>
      <div style="position:absolute;left:70px;right:70px;top:170px;display:flex;flex-direction:column;gap:18px">
        ${cards.map((f) => `<img src="${b64(f)}" style="width:100%;border-radius:10px;box-shadow:0 8px 30px rgba(20,30,45,.10)">`).join("")}
      </div>`), `${imgDir}/preview-1280x720.jpg`, 1280, 720);
    // square thumbnail 600x600
    await shot(shell(pk.palette, `
      <div style="position:absolute;left:46px;top:56px;right:46px">
        <div style="font-size:15px"><span class="chip" style="border-width:2px">${n} AI prompts</span></div>
        <h1 class="h" style="font-size:54px;margin-top:20px">${esc(pk.short)}</h1>
        <p style="font-size:21px;line-height:1.4;color:#3c424c;margin-top:18px">${esc(pk.audience)}</p>
      </div>
      <img class="paper" src="${b64(cover)}" style="position:absolute;width:250px;right:46px;bottom:-60px;transform:rotate(4deg)">`), `${imgDir}/thumbnail-600x600.jpg`, 600, 600);
    console.log(`gumroad images ${pk.slug}: 3`);
  }
}

// ---------------------------------------------------------------- 14-day content plans (phone/iPad PDFs) + Pinterest pins
const nl2br = (t) => esc(t).replace(/\n/g, "<br>");
function planHtml(key) {
  const P = PLANS[key];
  const isPrompts = key === "prompts";
  const cal = P.calendar.map(([task, tag], i) => `<tr><td><b>${esc(P.startLabel(i))}</b></td><td><span class="tag">${esc(tag)}</span> ${esc(task)}</td><td class="done"><i></i></td></tr>`).join("");
  const posts = P.posts.map((p) => `<div class="card"><div class="cardhead"><span class="id">${esc(p.id)}</span><span class="where">${esc(p.where)}</span></div>${isPrompts ? "" : `<div class="ptitle">${esc(p.title)}</div>`}<div class="post">${nl2br(p.text)}</div>${p.video ? `<div class="note"><b>Video idea:</b> ${esc(p.video)}</div>` : ""}</div>`).join("");
  const extras = isPrompts
    ? `<h2 class="sec">Video scripts (30 seconds, screen recording)</h2><p class="note">Record your phone or computer screen while you use the prompt in ChatGPT or Claude. Show the real answer; do not edit it to look better.</p>${P.videos.map((v) => {
        const [t, body] = pick(v.pack, v.n);
        return `<div class="card"><div class="cardhead"><span class="id">${esc(v.id)}</span><span class="where">${esc(v.title)}</span></div><ol class="steps"><li><b>0-3 s, on-screen text:</b> "${esc(t)} in 30 seconds"</li><li><b>3-8 s:</b> paste this prompt with your example details filled in: <span class="mono">${esc(body)}</span></li><li><b>8-25 s:</b> scroll through the AI's real answer.</li><li><b>25-30 s, say:</b> "There are 30 of these in my pack. Link in bio."</li></ol></div>`;
      }).join("")}`
    : `<h2 class="sec">Pinterest pin copy</h2><p class="note">Upload the pin images from the <b>pins</b> folder. Link every pin to its Etsy listing. Two pins per planner, posted on different days.</p>${P.posts.map((p) => `<div class="card"><div class="cardhead"><span class="id">${esc(p.id)}</span><span class="where">${esc(p.title)}</span></div><p><b>Link (both pins):</b> ${esc(p.link)}</p><p><b>Pin A title:</b> ${esc(p.pinA.title)}<br><b>Description:</b> ${esc(p.pinA.description)}</p><p><b>Pin B title:</b> ${esc(p.pinB.title)}<br><b>Description:</b> ${esc(p.pinB.description)}</p></div>`).join("")}`;
  const metric = isPrompts ? ["Date", "Post ID", "Where (group / app)", "Link to post", "Views", "Sales"] : ["Date", "Post / pin", "Where", "Link", "Etsy views", "Sales"];
  const rules = isPrompts
    ? [["3+ sales across the packs", "Target hit. Mark the experiment validated. Raise the best seller to $19 and make a 4th pack for the audience that bought."],
       ["1-2 sales", "Watch. Extend 7 days and put every post into the audience that clicked most (Gumroad > Analytics shows views per product)."],
       ["0 sales, under 100 product views", "A traffic problem, not a product problem. Try new groups or video before killing anything."],
       ["0 sales, 100+ views", "People see it but don't buy. Test a new cover or headline, or one free sample prompt, for 7 more days, then decide validated or killed."]]
    : [["3+ sales", "Target hit. Mark the experiment validated. Make 2-3 more variations of the best-selling planner (Etsy rewards shops with more listings in a niche)."],
       ["1-2 sales", "Watch. Extend 7 days; pin the top listing daily and improve the other listings' first photo."],
       ["0 sales, under 200 Etsy views", "A traffic problem. Keep pinning (Pinterest can take weeks to pick up) and post in more groups."],
       ["0 sales, 200+ views and favorites", "Interest but no buying. Test the price ($4.99) or a clearer first photo for 7 days, then decide validated or killed."]];
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(P.title)}</title><style>${css("letter", P.palette)}
@page { size: 8.5in 11in; margin: 0.55in 0.6in; }
@page:first { margin: 0; }
.flow { font-size: 10.5pt; line-height: 1.5; }
.flow h2.sec { font: 400 21pt/1.1 "DM Serif Display", serif; border-bottom: 2.5pt solid var(--accent); padding-bottom: 5pt; margin: 4pt 0 10pt; break-after: avoid; }
.newpage { break-before: page; }
.card { border: 0.75pt solid var(--rule); border-radius: 8pt; padding: 10pt 12pt; margin: 0 0 9pt; break-inside: avoid; }
.cardhead { display: flex; gap: 8pt; align-items: baseline; margin-bottom: 5pt; }
.cardhead .id { font: 700 9pt Inter; color: #fff; background: var(--accent); border-radius: 4pt; padding: 2pt 6pt; }
.cardhead .where { font-size: 8.5pt; color: var(--soft); }
.ptitle { font-weight: 700; margin-bottom: 4pt; }
.post { background: var(--tint); border-radius: 6pt; padding: 8pt 10pt; font-size: 10pt; }
.mono { display: block; background: var(--tint); border-radius: 5pt; padding: 5pt 8pt; margin-top: 3pt; font-size: 9pt; }
.steps { margin: 0; padding-left: 16pt; } .steps li { margin-bottom: 4pt; }
table.cal { width: 100%; border-collapse: collapse; font-size: 9.5pt; } table.cal td { border-bottom: 0.75pt solid var(--faint); padding: 7pt 5pt; vertical-align: top; }
table.cal td:first-child { width: 1.15in; white-space: nowrap; } table.cal td.done { width: 0.35in; } table.cal td.done i { display: inline-block; width: 11pt; height: 11pt; border: 1pt solid var(--accent); border-radius: 2pt; }
table.cal tr { break-inside: avoid; }
.tag { font: 700 7pt Inter; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); border: 0.9pt solid var(--accent); border-radius: 99pt; padding: 1pt 5pt; margin-right: 3pt; }
.rule { display: grid; grid-template-columns: 1.7in 1fr; gap: 10pt; border-bottom: 0.75pt solid var(--faint); padding: 8pt 0; break-inside: avoid; } .rule b { color: var(--accent); }
ul.dos { padding-left: 16pt; margin: 0 0 10pt; } ul.dos li { margin-bottom: 4pt; }
</style></head><body>
<section class="page cover"><div><div class="band"></div><div class="pill">${isPrompts ? "Gumroad · Oct 8 to Oct 22, 2026" : "Etsy + Pinterest · Oct 8 to Oct 22, 2026"}</div><h1 style="margin-top:16pt">${esc(P.title)}</h1>
<div class="sub">${isPrompts ? "Goal: 3 sales across the three $12 prompt packs in 14 days. Every post gives away one genuinely useful prompt, then mentions the pack." : "Goal: 3 sales across the five planners in 14 days. Pinterest brings planner buyers; groups and short videos add the first visitors."}</div></div>
<div><div style="font:700 8pt Inter;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin-bottom:8pt">Inside</div><ul><li>Rules that keep posts welcome</li><li>14-day calendar with checkboxes</li><li>${P.posts.length} ready-to-post texts</li><li>${isPrompts ? "3 video scripts" : "Pinterest pin copy (pin images in the pins folder)"}</li><li>Results tracker</li><li>Day 14 decision rules</li></ul></div>
<div class="note">Your real ${isPrompts ? "Gumroad" : "Etsy"} links are already in every post. Record every sale in Money OS → Revenue so the experiment shows real numbers.</div></section>
<div class="flow">
<h2 class="sec">Rules that keep posts welcome</h2>
<ul class="dos"><li><b>Read each group's rules first.</b> Many only allow promotion on certain days or in a pinned thread. Follow them; a ban costs more than one post.</li>
<li><b>Give first.</b> Every post includes something useful on its own. The link is one line at the end.</li>
<li><b>Say it's yours.</b> "I made this" is honest and works better than pretending to be a customer.</li>
<li><b>No fake claims:</b> no invented sales numbers, reviews, "best seller" or fake deadlines.</li>
<li><b>Answer every comment</b> within a day. Questions in comments often turn into sales.</li>
<li><b>One post per group per week</b> at most. Spread posts across groups.</li></ul>
<h2 class="sec">14-day calendar</h2>
<table class="cal">${cal}</table>
<h2 class="sec newpage">Ready-to-post texts</h2>
${posts}
${extras}
<h2 class="sec newpage">Results tracker</h2>
<p class="note">Fill this in as you go (or keep it in your Notes app). Views: ${isPrompts ? "Gumroad > Analytics" : "Etsy > Shop Manager > Stats"}.</p>
<table class="t" style="height:auto">${`<tr>${metric.map((m, i) => `<th style="width:${[11, 11, 26, 26, 13, 13][i]}%">${m}</th>`).join("")}</tr>`}${Array.from({ length: 24 }, () => `<tr style="height:24pt">${metric.map(() => "<td>&nbsp;</td>").join("")}</tr>`).join("")}</table>
<h2 class="sec newpage">Day 14 decision rules</h2>
${rules.map(([a, b]) => `<div class="rule"><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join("")}
<p class="note" style="margin-top:12pt">Decide from recorded numbers only. Then mark the experiment validated or killed in Money OS → Experiments, with a one-line result note.</p>
</div></body></html>`;
}

if (what === "plan-preview") {
  for (const key of Object.keys(PLANS)) {
    const p = await browser.newPage({ viewport: { width: 816, height: 1056 } });
    await p.setContent(planHtml(key), { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: `${process.env.PREVIEW_DIR}/plan-${key}.png`, fullPage: true });
    await p.close();
  }
}

if (what === "plans" || what === "all") {
  mkdirSync(`${OUT}content-plans`, { recursive: true });
  for (const key of Object.keys(PLANS)) {
    const p = await browser.newPage();
    await p.setContent(planHtml(key), { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    const file = `${OUT}content-plans/${key === "prompts" ? "prompt-packs-content-plan" : "etsy-planners-content-plan"}.pdf`;
    await p.pdf({ path: file, width: "8.5in", height: "11in", printBackground: true, preferCSSPageSize: true });
    await p.close();
    console.log(`content plan ${key}`);
  }
}

if (what === "pins" || what === "all") {
  for (const pl of PLANNERS) {
    const L = LISTINGS[pl.slug];
    const dir = `${OUT}planners/${pl.slug}`;
    const pinDir = `${OUT}pins/${pl.slug}`;
    mkdirSync(pinDir, { recursive: true });
    const pages = readdirSync(`${dir}/pages`).sort().map((f) => `${dir}/pages/${f}`);
    await shot(shell(pl.palette, `
      <div style="position:absolute;left:70px;right:70px;top:80px">
        <div style="font-size:22px"><span class="chip" style="border-width:2px">Printable · Undated</span></div>
        <h1 class="h" style="font-size:78px;margin-top:22px">${esc(pl.title)}</h1>
        <p style="font-size:30px;line-height:1.35;color:#3c424c;margin-top:20px">${esc(L.heroLine)}</p>
      </div>
      <img class="paper" src="${b64(pages[L.detailPage])}" style="position:absolute;width:700px;left:150px;top:560px;transform:rotate(-2deg)">
      <div style="position:absolute;left:0;right:0;bottom:0;height:120px;background:var(--accent);color:#fff;font:700 34px Inter;display:flex;align-items:center;justify-content:center">Instant download · US Letter + A4</div>`), `${pinDir}/pin-A-1000x1500.jpg`, 1000, 1500);
    const thumbs = pages.slice(1, 9);
    await shot(shell(pl.palette, `
      <div style="position:absolute;left:60px;right:60px;top:60px">
        <h1 class="h" style="font-size:64px">${pl.pages.length - 1} printable pages</h1>
        <p style="font-size:30px;color:#3c424c;margin-top:12px">${esc(pl.title)}</p>
      </div>
      <div style="position:absolute;left:60px;right:60px;top:300px;display:grid;grid-template-columns:repeat(3,1fr);gap:56px 26px">
        ${thumbs.slice(0, 6).map((f, i) => `<figure style="margin:0"><img class="paper" src="${b64(f)}" style="width:100%"><figcaption style="font-size:20px;font-weight:600;margin-top:10px;line-height:1.25">${esc(pl.pages[i + 1].name)}</figcaption></figure>`).join("")}
      </div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:120px;background:var(--accent);color:#fff;font:700 34px Inter;display:flex;align-items:center;justify-content:center">Instant download · US Letter + A4</div>`), `${pinDir}/pin-B-1000x1500.jpg`, 1000, 1500);
    console.log(`pins ${pl.slug}: 2`);
  }
}

// ---------------------------------------------------------------- copy-paste listing sheets
if (what === "listings" || what === "all") {
  mkdirSync(`${OUT}listings`, { recursive: true });
  for (const pl of PLANNERS) {
    const L = LISTINGS[pl.slug];
    const md = [`# Etsy listing: ${pl.title}`, "", "Copy each field into Etsy (Shop Manager > Listings > Add a listing).", "",
      "## Photos (upload in this order)", ...["01-hero.jpg", "02-whats-inside.jpg", "03-close-up.jpg", "04-how-it-works.jpg"].map((f) => `- \`listing-images/etsy/${pl.slug}/${f}\``), "",
      "## Digital files (upload both)", `- \`planners/${pl.slug}/${pl.slug}-US-Letter.pdf\``, `- \`planners/${pl.slug}/${pl.slug}-A4.pdf\``, "",
      "## Listing details", "- Type: Digital files · Who made it: I did · What is it: A finished product · When was it made: 2020-2026 (or the current range Etsy shows)",
      "- Category: type \"planner\" and pick Etsy's suggested calendars & planners category (exact names change; use the closest match)",
      "- Disclose AI use where Etsy's listing form or creativity standards ask for it (the description below already says so).",
      `- Suggested price: $${L.price} (owner decides)`, `- Live listing: ${L.url}`, "", "## Title", "```", L.title, "```", "", "## Tags (13)", "```", L.tags.join(", "), "```", "", "## Description", "```", L.description, "```", ""].join("\n");
    writeFileSync(`${OUT}listings/etsy-${pl.slug}.md`, md);
  }
  for (const pk of PACKS) {
    const G = GUMROAD[pk.slug];
    const md = [`# Gumroad product: ${pk.title}`, "", "Gumroad > Products > New product > Digital product.", "",
      "## Files to upload as the product", `- \`prompts/${pk.slug}/${pk.slug}.pdf\``, `- \`prompts/${pk.slug}/${pk.slug}.txt\``, "",
      "## Images", `- Cover: \`listing-images/gumroad/${pk.slug}/cover-1280x720.jpg\` (add \`preview-1280x720.jpg\` as a second cover image)`, `- Thumbnail: \`listing-images/gumroad/${pk.slug}/thumbnail-600x600.jpg\``, "",
      `## Name`, "```", pk.title, "```", "", `## Suggested price`, `$${G.price} (owner decides)`, "", "## Live product", G.url, "", "## Summary (one line)", "```", G.summary, "```", "", "## Description", "```", gumroadDescription(pk, promptCount(pk)), "```", ""].join("\n");
    writeFileSync(`${OUT}listings/gumroad-${pk.slug}.md`, md);
  }
  console.log("listing sheets written");
}

await browser.close();
writeFileSync(`${OUT}.built`, new Date().toISOString());
