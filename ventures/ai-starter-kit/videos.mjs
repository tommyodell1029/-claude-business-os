// Story Shorts for the AI Side Hustle Starter Kit (same standard as ventures/digital-products/STORY_VIDEOS.md):
// Kling clip (out/videos/<id>-clip.mp4) + "Animated dramatization · AI-generated" label + 3.5 s end card built from
// the real kit cover, the real price and "Link in bio".  FFMPEG=<ffmpeg> node ventures/ai-starter-kit/videos.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { css } from "../digital-products/lib.mjs";
import { KIT } from "./kit.mjs";

const { chromium } = createRequire(new URL("../digital-products/package.json", import.meta.url))("playwright");
const FF = process.env.FFMPEG ?? "ffmpeg";
const W = 1080, H = 1920, FPS = 30, END = 3.5;
const DIR = fileURLToPath(new URL("./out/videos/", import.meta.url));
const IDS = ["K1", "K2"];
const cover = `data:image/png;base64,${readFileSync(fileURLToPath(new URL("./out/pages/kit-cover.png", import.meta.url))).toString("base64")}`;
const run = (args) => execFileSync(FF, ["-y", "-loglevel", "error", ...args]);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const shot = async (html, file, transparent = false) => {
  const p = await browser.newPage({ viewport: { width: W, height: H } });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css("letter", KIT.palette)}
html,body{width:${W}px;height:${H}px;margin:0;${transparent ? "background:transparent!important" : ""}}</style></head><body>${html}</body></html>`, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: file, omitBackground: transparent });
  await p.close();
};
mkdirSync(`${DIR}tmp`, { recursive: true });
await shot(`<div style="position:absolute;top:110px;left:60px;font:700 28px Inter;letter-spacing:.1em;text-transform:uppercase;color:#fff;background:rgba(20,24,30,.6);border-radius:999px;padding:12px 26px">Animated dramatization · AI-generated</div>`, `${DIR}tmp/overlay.png`, true);
await shot(`<div style="position:absolute;inset:0;background:linear-gradient(160deg,var(--tint),#fff 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:56px;font-family:Inter">
<img src="${cover}" style="width:720px;border-radius:14px;box-shadow:0 40px 90px rgba(20,30,45,.22)">
<div style="font:400 84px/1 'DM Serif Display',serif;color:#1f232a">$12 · Link in bio</div>
<div style="font:600 40px Inter;color:var(--accent)">Free AI tools list there too</div></div>`, `${DIR}tmp/end.png`);
await browser.close();

run(["-loop", "1", "-i", `${DIR}tmp/end.png`, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(END),
  "-vf", `scale=${W}:${H},fps=${FPS},fade=t=in:st=0:d=0.25,format=yuv420p`, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k", `${DIR}tmp/end.mp4`]);
for (const id of IDS) {
  const clip = `${DIR}${id}-clip.mp4`;
  if (!existsSync(clip)) { console.log(`${id}: no clip yet`); continue; }
  run(["-i", clip, "-i", `${DIR}tmp/overlay.png`, "-filter_complex",
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS}[b];[b][1:v]overlay=0:0,format=yuv420p[v];[0:a]aresample=44100,aformat=channel_layouts=stereo[a]`,
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k", `${DIR}tmp/${id}-seg.mp4`]);
  run(["-i", `${DIR}tmp/${id}-seg.mp4`, "-i", `${DIR}tmp/end.mp4`, "-filter_complex", "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]",
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", `${DIR}${id}-ai-starter-kit-story.mp4`]);
  console.log(`${id} done`);
}
