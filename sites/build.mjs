// Build client sites from sites/clients/<slug>.json -> sites/out/<slug>/index.html. Concept sites are also copied to
// site/public/sample/<slug>/ so the offer page can show them.  node sites/build.mjs [slug]
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "./template.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const only = process.argv[2];
for (const f of readdirSync(here("./clients/")).filter((x) => x.endsWith(".json"))) {
  const c = JSON.parse(readFileSync(here(`./clients/${f}`), "utf8"));
  if (only && c.slug !== only) continue;
  const html = render(c);
  mkdirSync(here(`./out/${c.slug}/`), { recursive: true });
  writeFileSync(here(`./out/${c.slug}/index.html`), html);
  if (c.concept) {
    mkdirSync(here(`../site/public/sample/${c.slug}/`), { recursive: true });
    copyFileSync(here(`./out/${c.slug}/index.html`), here(`../site/public/sample/${c.slug}/index.html`));
  }
  console.log(`${c.slug}: ${html.length} bytes${c.concept ? " (concept, copied to site/public/sample)" : ""}`);
}
