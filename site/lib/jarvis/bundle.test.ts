import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SECRET_ENV_NAMES, scan } from "../../scripts/check-client-bundle.mjs";

test("scanner flags a secret env name in a client chunk and passes a clean one", () => {
  const dir = mkdtempSync(join(tmpdir(), "jv-bundle-"));
  writeFileSync(join(dir, "clean.js"), "console.log('NEXT_PUBLIC_FOO')");
  assert.deepEqual(scan(dir), []);
  writeFileSync(join(dir, "leak.js"), "const k=process.env.DEEPGRAM_API_KEY;");
  const hits = scan(dir) as { name: string }[];
  assert.deepEqual(hits.map((h) => h.name), ["DEEPGRAM_API_KEY"]);
});

test("built client bundle contains no secret env names (when .next/static exists)", () => {
  const dir = fileURLToPath(new URL("../../.next/static", import.meta.url));
  assert.deepEqual(scan(dir), []);
});

test("client-side Jarvis sources never read env vars or name secrets", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const clientFiles = [
    ...readdirSync(join(root, "components/jarvis")).map((f) => join(root, "components/jarvis", f)),
    join(root, "lib/jarvis/confirmWords.ts"),
  ];
  for (const f of clientFiles) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /process\.env/, f);
    for (const n of SECRET_ENV_NAMES as string[]) assert.ok(!src.includes(n), `${n} in ${f}`);
    // client code may import only the pure confirmation parser from lib/jarvis
    for (const m of src.matchAll(/from "([^"]+)"/g)) if (m[1].includes("lib/jarvis")) assert.match(m[1], /confirmWords\.ts$/, f);
  }
});
