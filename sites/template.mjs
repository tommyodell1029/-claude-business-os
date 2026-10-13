// One-page client website template (LaunchPad Local $499 offer). Pure function: config -> one self-contained HTML
// file (inline CSS, no JS frameworks, no external requests except optional self-chosen images) so it scores well on
// mobile Lighthouse and can be hosted anywhere. Every fact on the page comes from the client config; nothing invented.
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const telHref = (p) => `tel:+1${String(p).replace(/\D/g, "").slice(-10)}`;

export function validate(c) {
  const errs = [];
  for (const k of ["slug", "business", "phone", "city", "headline", "intro", "services", "area", "hours"]) if (!c[k] || (Array.isArray(c[k]) && !c[k].length)) errs.push(`missing ${k}`);
  if (c.slug && !/^[a-z0-9-]{3,60}$/.test(c.slug)) errs.push("slug must be lowercase letters, digits and dashes");
  if (c.phone && String(c.phone).replace(/\D/g, "").length < 10) errs.push("phone must have 10 digits");
  if (!c.concept && !c.form?.endpoint) errs.push("a real client site needs form.endpoint (tested delivery) before launch");
  if (c.reviews?.length && c.concept) errs.push("concept sites must not show reviews");
  for (const r of c.reviews ?? []) if (!r.source_url) errs.push("every review needs a source_url (real, public review)");
  return errs;
}

export function render(c) {
  const errs = validate(c);
  if (errs.length) throw new Error(`site config ${c.slug ?? "?"}: ${errs.join("; ")}`);
  const col = { primary: "#0f4c5c", accent: "#e36414", light: "#f1f5f6", ink: "#14212b", ...(c.colors ?? {}) };
  const tel = telHref(c.phone);
  const title = `${c.business} | ${c.trade ?? "Local service"} in ${c.city}`;
  const description = c.meta_description ?? `${c.business}: ${c.services.map((s) => s.name.toLowerCase()).slice(0, 3).join(", ")} in ${c.city}. Call ${c.phone}.`;
  const ld = {
    "@context": "https://schema.org", "@type": c.schema_type ?? "LocalBusiness", name: c.business, telephone: c.phone,
    areaServed: c.area, ...(c.url ? { url: c.url } : {}), ...(c.address ? { address: c.address } : {}),
  };
  const form = c.concept
    ? `<p class="note">This is a sample site. The form below is turned off.</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${c.concept ? '<meta name="robots" content="noindex">' : ""}
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<style>
:root{--p:${col.primary};--a:${col.accent};--l:${col.light};--i:${col.ink}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font:17px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--i);background:#fff}
a{color:inherit}.w{max-width:1040px;margin:0 auto;padding:0 20px}
.concept{background:#fff3c4;color:#5c4400;font-size:14px;text-align:center;padding:8px 16px}
header{background:var(--p);color:#fff}
.bar{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:64px}
.name{font-weight:800;font-size:19px;text-decoration:none}
.call{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 18px;border-radius:8px;background:var(--a);color:#fff;font-weight:800;text-decoration:none;white-space:nowrap}
.call:focus-visible,.btn2:focus-visible{outline:3px solid #fff;outline-offset:2px}
.hero{background:var(--p);color:#fff;padding:28px 0 44px}
h1{font-size:clamp(30px,7vw,48px);line-height:1.08;margin:0 0 14px;max-width:16ch}
.hero p{font-size:18px;max-width:34em;margin:0 0 22px;opacity:.92}
.btn2{display:inline-flex;align-items:center;min-height:48px;padding:0 18px;border-radius:8px;border:2px solid #fff;color:#fff;font-weight:700;text-decoration:none;margin-left:8px}
section{padding:44px 0}.alt{background:var(--l)}
h2{font-size:28px;line-height:1.15;margin:0 0 18px}
.svc{display:grid;gap:14px;grid-template-columns:1fr}
@media(min-width:760px){.svc{grid-template-columns:1fr 1fr}}
.svc div{border-left:5px solid var(--a);padding:6px 0 6px 14px}
.svc h3{margin:0 0 4px;font-size:19px}.svc p{margin:0}
.facts{display:grid;gap:18px;grid-template-columns:1fr}
@media(min-width:760px){.facts{grid-template-columns:1fr 1fr 1fr}}
.facts h3{margin:0 0 4px;font-size:16px;color:var(--p)}.facts p{margin:0}
form{display:grid;gap:12px;max-width:520px}
label{font-weight:700;font-size:15px;display:block;margin-bottom:4px}
input,textarea{width:100%;font:inherit;padding:12px;border:2px solid #b9c4ca;border-radius:8px}
input:focus,textarea:focus{outline:3px solid var(--a);outline-offset:1px}
button{min-height:48px;border:0;border-radius:8px;background:var(--a);color:#fff;font:inherit;font-weight:800;padding:0 20px;cursor:pointer}
button[disabled]{opacity:.55;cursor:not-allowed}
.note{background:#fff3c4;padding:10px 12px;border-radius:8px;font-size:15px}
footer{background:var(--i);color:#cfd8dc;font-size:15px;padding:26px 0 90px}
.sticky{position:fixed;left:12px;right:12px;bottom:12px;display:flex}
.sticky .call{flex:1;box-shadow:0 8px 24px rgba(0,0,0,.25)}
@media(min-width:760px){.sticky{display:none}footer{padding-bottom:26px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
</head>
<body>
${c.concept ? `<div class="concept">Sample website made by LaunchPad Local. ${esc(c.business)} is not a real business.</div>` : ""}
<header><div class="w bar"><a class="name" href="#top">${esc(c.business)}</a><a class="call" href="${tel}">Call ${esc(c.phone)}</a></div></header>
<main id="top">
<div class="hero"><div class="w">
<h1>${esc(c.headline)}</h1>
<p>${esc(c.intro)}</p>
<a class="call" href="${tel}">Call now</a><a class="btn2" href="#request">Request service</a>
</div></div>
<section><div class="w"><h2>Services</h2><div class="svc">
${c.services.map((s) => `<div><h3>${esc(s.name)}</h3><p>${esc(s.text)}</p></div>`).join("\n")}
</div></div></section>
<section class="alt"><div class="w facts">
<div><h3>Service area</h3><p>${esc(c.area)}</p></div>
<div><h3>Hours</h3><p>${esc(c.hours)}</p></div>
<div><h3>${esc(c.extra?.title ?? "Call us")}</h3><p>${esc(c.extra?.text ?? `Call ${c.phone} and tell us what's going on.`)}</p></div>
</div></section>
${(c.reviews ?? []).length ? `<section><div class="w"><h2>What customers say</h2>${c.reviews.map((r) => `<blockquote>${esc(r.text)}<br><cite>${esc(r.author)} · <a href="${esc(r.source_url)}">${esc(r.source ?? "source")}</a></cite></blockquote>`).join("")}</div></section>` : ""}
<section id="request"><div class="w"><h2>Request service</h2>
${form}
<form ${c.concept ? "" : `method="post" action="${esc(c.form.endpoint)}"`}>
<input type="hidden" name="site" value="${esc(c.slug)}">
<div><label for="n">Name</label><input id="n" name="name" autocomplete="name" required ${c.concept ? "disabled" : ""}></div>
<div><label for="p">Phone</label><input id="p" name="phone" type="tel" autocomplete="tel" required ${c.concept ? "disabled" : ""}></div>
<div><label for="m">What do you need help with?</label><textarea id="m" name="message" rows="4" ${c.concept ? "disabled" : ""}></textarea></div>
<div style="position:absolute;left:-9999px" aria-hidden="true"><label for="hp">Leave empty</label><input id="hp" name="website" tabindex="-1" autocomplete="off"></div>
<button type="submit" ${c.concept ? "disabled" : ""}>Send request</button>
</form>
</div></section>
</main>
<footer><div class="w">${esc(c.business)} · ${esc(c.city)} · <a href="${tel}">${esc(c.phone)}</a>${c.license ? ` · ${esc(c.license)}` : ""}<br>Website by LaunchPad Local</div></footer>
<div class="sticky"><a class="call" href="${tel}">Call ${esc(c.phone)}</a></div>
</body>
</html>
`;
}
