// Turns a spoken reply into an explicit decision on a pending action. Pure, so the browser can use it too.
// Strict on purpose: only a short, unambiguous yes or no counts. Anything else goes to Jarvis as a normal message.

const YES = new Set(["yes", "yes confirm", "confirm", "confirmed", "i confirm", "yes i confirm", "do it", "yes do it", "go ahead", "yes go ahead", "proceed", "yes proceed", "affirmative", "yes please"]);
const NO = new Set(["no", "cancel", "no cancel", "dont", "do not", "stop", "abort", "never mind", "nevermind", "no thanks", "no thank you", "reject", "negative", "dont do it", "do not do it"]);

export function normalizeUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\b(jarvis|ultron|sir|okay|ok)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseConfirmation(text: string): "confirm" | "reject" | null {
  if (typeof text !== "string" || text.length > 80) return null;
  const n = normalizeUtterance(text);
  if (!n) return null;
  const variants = [n, n.replace(/\bplease\b/g, "").replace(/\s+/g, " ").trim()];
  for (const v of variants) {
    if (YES.has(v)) return "confirm";
    if (NO.has(v)) return "reject";
  }
  return null;
}
