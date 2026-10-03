/** Demo line, shown only when SHOW_DEMO_PHONE=true and DEMO_PHONE is a usable number. Default: hidden. */
export function demoPhone(env: Record<string, string | undefined> = process.env): { display: string; tel: string } | null {
  if (env.SHOW_DEMO_PHONE?.trim().toLowerCase() !== "true") return null;
  const digits = (env.DEMO_PHONE ?? "").replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length === 10) {
    return {
      display: `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`,
      tel: `+1${national}`,
    };
  }
  return null;
}
