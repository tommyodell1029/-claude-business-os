// One-time client intake page. Reads the intake row by token hash (server-side only). Invalid, expired and unknown
// links all show the same message so the page can't be used to probe tokens.
import type { Metadata } from "next";
import { ONBOARD_CONSENT_TEXT, hashToken, intakesDb, isOpen, isTokenShape, spanishAllowed } from "../../../lib/onboard.ts";
import OnboardForm from "./OnboardForm.tsx";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up your receptionist", robots: { index: false, follow: false }, referrer: "no-referrer" };

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="wrap narrow prose">
      <h1>{title}</h1>
      <p>{children}</p>
    </article>
  );
}

export default async function Onboard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bad = <Message title="This link is not valid">It may have expired. Please contact us and we will send you a new one.</Message>;
  if (!url || !key || !isTokenShape(token)) return bad;
  let row;
  try {
    row = await intakesDb(url, key).findByHash(hashToken(token));
  } catch (e) {
    console.error(`onboard page: ${(e as Error).message}`);
    return <Message title="Please try again shortly">This page is not available right now.</Message>;
  }
  if (!row || row.status === "revoked") return bad;
  if (row.status !== "pending") return <Message title="Thank you, we have your answers">We are setting up your receptionist. Contact us if anything needs to change.</Message>;
  if (!isOpen(row)) return bad;
  return (
    <article className="wrap narrow">
      <h1>{row.business_hint ? `Welcome, ${row.business_hint}` : "Let's set up your receptionist"}</h1>
      <p>
        These answers are exactly what your AI receptionist will know and say, so please only include things you are happy for callers to
        hear. It takes about 10 minutes. You can submit once; if you need to change something afterwards, just contact us.
      </p>
      <OnboardForm consentText={ONBOARD_CONSENT_TEXT} spanish={spanishAllowed(row)} />
    </article>
  );
}
