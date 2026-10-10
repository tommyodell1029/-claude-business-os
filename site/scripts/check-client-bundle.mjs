// Fails the build if any server-only secret env var NAME appears in the browser bundle (.next/static).
// A name in client code means server code was pulled into a client component, or a secret was exposed.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SECRET_ENV_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "ANTHROPIC_API_KEY", "LP_ANTHROPIC_API_KEY", "DEEPGRAM_API_KEY", "YOUTUBE_API_KEY", "GUMROAD_ACCESS_TOKEN",
  "ELEVENLABS_API_KEY", "JARVIS_OWNER_EMAIL", "JARVIS_VOICE_ID", "RESEND_API_KEY", "TWILIO_AUTH_TOKEN", "TWILIO_ACCOUNT_SID",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "IP_HASH_SALT", "PIPECAT_API_KEY",
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(js|mjs|css|html|json|map)$/.test(name)) yield p;
  }
}

/** Returns [{file, name}] for every secret name found under dir. */
export function scan(dir, names = SECRET_ENV_NAMES) {
  const hits = [];
  if (!existsSync(dir)) return hits;
  for (const f of files(dir)) {
    const text = readFileSync(f, "utf8");
    for (const n of names) if (new RegExp(`(?<![A-Z0-9_])${n}(?![A-Z0-9_])`).test(text)) hits.push({ file: f, name: n });
  }
  return hits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = fileURLToPath(new URL("../.next/static", import.meta.url));
  if (!existsSync(dir)) {
    console.error("client bundle check: .next/static not found (run next build first)");
    process.exit(1);
  }
  const hits = scan(dir);
  if (hits.length) {
    for (const h of hits) console.error(`client bundle check: ${h.name} found in ${h.file}`);
    process.exit(1);
  }
  console.log(`client bundle check: no secret env names in .next/static (${SECRET_ENV_NAMES.length} names checked)`);
}
