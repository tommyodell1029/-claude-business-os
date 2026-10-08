// Shared building blocks for the printable planners and prompt-pack PDFs.
// Pages are plain HTML/CSS rendered to PDF by Chromium (build.mjs). Every page fills exactly one sheet; the same
// markup prints on US Letter and A4 because sizes come from CSS variables set per paper size.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const font = (f) => `data:font/woff2;base64,${readFileSync(here(`./fonts/${f}`)).toString("base64")}`;

export const PAPER = {
  letter: { w: "8.5in", h: "11in", label: "US Letter" },
  a4: { w: "210mm", h: "297mm", label: "A4" },
};

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Base stylesheet. --accent and --tint come from each product's palette. */
export function css(paper, palette) {
  const p = PAPER[paper];
  return `
@font-face { font-family: "Inter"; src: url(${font("Inter.woff2")}) format("woff2"); font-weight: 100 900; }
@font-face { font-family: "DM Serif Display"; src: url(${font("DMSerifDisplay.woff2")}) format("woff2"); font-weight: 400; }
@page { size: ${p.w} ${p.h}; margin: 0; }
:root { --pw: ${p.w}; --ph: ${p.h}; --accent: ${palette.accent}; --tint: ${palette.tint}; --ink: #23272f; --soft: #6b7280; --rule: #c9ced6; --faint: #e7eaee; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: var(--ink); font-family: "Inter", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: var(--pw); height: var(--ph); padding: 0.5in 0.55in 0.45in; display: flex; flex-direction: column; gap: 0.16in; page-break-after: always; break-after: page; overflow: hidden; position: relative; }
.page:last-child { page-break-after: auto; break-after: auto; }
.hdr { display: flex; align-items: flex-end; justify-content: space-between; gap: 0.2in; border-bottom: 2.5pt solid var(--accent); padding-bottom: 0.08in; }
.hdr h1 { font: 400 26pt/1 "DM Serif Display", serif; margin: 0; letter-spacing: 0.01em; }
.hdr .kicker { font: 600 7.5pt/1 "Inter"; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); margin-bottom: 4pt; }
.fields { display: flex; gap: 0.18in; font-size: 8.5pt; color: var(--soft); }
.field { display: flex; align-items: flex-end; gap: 4pt; white-space: nowrap; }
.field span.b { display: inline-block; min-width: 1.1in; border-bottom: 0.75pt solid var(--rule); height: 12pt; }
.row { display: flex; gap: 0.14in; min-height: 0; }
.col { display: flex; flex-direction: column; gap: 0.14in; min-height: 0; min-width: 0; }
.grow { flex: 1 1 0; min-height: 0; min-width: 0; }
.box { border: 0.75pt solid var(--rule); border-radius: 6pt; padding: 7pt 9pt 6pt; display: flex; flex-direction: column; min-height: 0; min-width: 0; background: #fff; }
.box.tint { background: var(--tint); border-color: transparent; }
.box > .lbl { font: 700 7.5pt/1 "Inter"; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); margin-bottom: 5pt; }
.box > .hint { font-size: 7pt; color: var(--soft); margin: -2pt 0 4pt; }
.lines { flex: 1 1 auto; min-height: 0; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--lh, 22pt) - 0.75pt), var(--faint) calc(var(--lh, 22pt) - 0.75pt), var(--faint) var(--lh, 22pt)); }
.dots { flex: 1 1 auto; min-height: 0; background-image: radial-gradient(circle, #c3c8cf 0.7pt, transparent 0.9pt); background-size: 14pt 14pt; background-position: 7pt 7pt; }
.checks { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: space-between; min-height: 0; }
.check { display: flex; align-items: flex-end; gap: 6pt; flex: 1 1 0; max-height: 26pt; border-bottom: 0.75pt solid var(--faint); padding-bottom: 3pt; font-size: 8.5pt; }
.check i { width: 9pt; height: 9pt; border: 0.9pt solid var(--accent); border-radius: 2pt; flex: none; margin-bottom: 1pt; }
.check i.c { border-radius: 50%; }
table.t { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.5pt; }
.tbox { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.tbox table.t { height: 100%; }
table.t th { text-align: left; font: 700 7pt/1.2 "Inter"; letter-spacing: 0.04em; text-transform: uppercase; color: #fff; background: var(--accent); padding: 0 4pt; height: 17pt; white-space: nowrap; overflow: hidden; text-overflow: clip; }
table.t th:first-child { border-top-left-radius: 5pt; } table.t th:last-child { border-top-right-radius: 5pt; }
table.t td { border-bottom: 0.75pt solid var(--faint); border-right: 0.75pt solid var(--faint); padding: 0 4pt; }
table.t td:last-child { border-right: none; }
table.t tr:nth-child(even) td { background: color-mix(in srgb, var(--tint) 45%, white); }
.note { font-size: 7.5pt; color: var(--soft); line-height: 1.45; }
.big { font: 400 15pt/1.15 "DM Serif Display", serif; }
.pill { display: inline-block; font: 600 7pt/1 "Inter"; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); border: 0.9pt solid var(--accent); border-radius: 99pt; padding: 3pt 7pt; }
.foot { position: absolute; bottom: 0.2in; left: 0.55in; right: 0.55in; display: flex; justify-content: space-between; font-size: 6.5pt; color: #a3a9b2; letter-spacing: .08em; text-transform: uppercase; }
.cover { padding: 0.8in 0.75in; justify-content: space-between; background: linear-gradient(160deg, var(--tint) 0%, #fff 60%); }
.cover h1 { font: 400 44pt/1.02 "DM Serif Display", serif; margin: 0 0 14pt; }
.cover .sub { font-size: 13pt; line-height: 1.45; color: #3c424c; max-width: 5.6in; }
.cover .band { height: 6pt; width: 1.4in; background: var(--accent); border-radius: 3pt; margin-bottom: 22pt; }
.cover ul { margin: 0; padding-left: 14pt; font-size: 10.5pt; line-height: 1.7; }
.prose { font-size: 10pt; line-height: 1.6; }
.prose h2 { font: 400 17pt/1.1 "DM Serif Display", serif; margin: 10pt 0 6pt; }
.prose p { margin: 0 0 8pt; }
.prose ol, .prose ul { margin: 0 0 8pt; padding-left: 16pt; }
`;
}

// ---- components (all return HTML strings) ----
export const header = (title, kicker, fields = []) => `
<div class="hdr"><div><div class="kicker">${esc(kicker)}</div><h1>${esc(title)}</h1></div>
<div class="fields">${fields.map((f) => `<div class="field">${esc(f)}<span class="b"></span></div>`).join("")}</div></div>`;

export const box = (label, inner, { cls = "", style = "", hint = "" } = {}) =>
  `<div class="box ${cls}" style="${style}"><div class="lbl">${esc(label)}</div>${hint ? `<div class="hint">${esc(hint)}</div>` : ""}${inner}</div>`;

export const lines = (lh = 22) => `<div class="lines" style="--lh:${lh}pt"></div>`;
export const dots = () => `<div class="dots"></div>`;
export const checks = (n, { circle = false, labels = [] } = {}) =>
  `<div class="checks">${Array.from({ length: n }, (_, i) => `<div class="check"><i class="${circle ? "c" : ""}"></i>${esc(labels[i] ?? "")}</div>`).join("")}</div>`;

/** A ruled table that fills its box: `cols` = [[name, widthPercent]], `rows` = number of blank rows, `first` = prefilled first-column labels. */
export function table(cols, rows, first = []) {
  const head = `<tr>${cols.map(([n, w]) => `<th style="width:${w}%">${esc(n)}</th>`).join("")}</tr>`;
  const body = Array.from({ length: rows }, (_, i) => `<tr>${cols.map((_, j) => `<td>${j === 0 && first[i] ? `<b>${esc(first[i])}</b>` : "&nbsp;"}</td>`).join("")}</tr>`).join("");
  return `<div class="tbox"><table class="t">${head}${body}</table></div>`;
}

export const footer = (brand, name) => `<div class="foot"><span>${esc(brand)}</span><span>${esc(name)}</span></div>`;

export const page = (inner, { cls = "", brand = "", name = "" } = {}) =>
  `<section class="page ${cls}">${inner}${brand ? footer(brand, name) : ""}</section>`;

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function doc(paper, palette, pagesHtml, title) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css(paper, palette)}</style></head><body>${pagesHtml}</body></html>`;
}
