// Copies ../config/offerings.yaml (single source of truth for prices) into content/offerings.yaml so the site
// builds from site/ alone (Vercel uploads only this folder). Runs before every build. Commit the copy.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../config/offerings.yaml");
const dst = resolve(here, "../content/offerings.yaml");

if (existsSync(src)) {
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  console.log("offerings: synced from config/offerings.yaml");
} else if (existsSync(dst)) {
  console.log("offerings: ../config not present, using committed content/offerings.yaml");
} else {
  console.error("offerings: no config/offerings.yaml and no content/offerings.yaml");
  process.exit(1);
}
