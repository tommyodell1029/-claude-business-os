// One-off generator for the Jarvis app icons (arc-reactor rings on black). Dependency-free PNG writer.
// Run: node scripts/make-jarvis-icons.mjs  (outputs public/jarvis-icon-180.png and -512.png; commit them).
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function icon(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  const cx = size / 2, cy = size / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / (size / 2);
      const ang = Math.atan2(y - cy, x - cx);
      let g = 0;
      g += Math.exp(-((r - 0.62) ** 2) / 0.0006);            // outer ring
      g += 0.8 * Math.exp(-((r - 0.45) ** 2) / 0.0012) * (Math.sin(ang * 10) > -0.2 ? 1 : 0.15); // segmented ring
      g += Math.exp(-(r ** 2) / 0.03);                         // core glow
      g = Math.min(1, g);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = Math.round(2 + 60 * g);
      raw[i + 1] = Math.round(7 + 218 * g);
      raw[i + 2] = Math.round(13 + 242 * g);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

for (const s of [180, 512]) writeFileSync(new URL(`../public/jarvis-icon-${s}.png`, import.meta.url), icon(s));
console.log("icons written");
