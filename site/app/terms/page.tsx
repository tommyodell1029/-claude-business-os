import type { Metadata } from "next";
import Link from "next/link";
import { cancellationText, foundingOpen, loadOfferings } from "../../lib/offerings.ts";

export const metadata: Metadata = { title: "Terms of service" };
const o = loadOfferings();

export default function Terms() {
  const email = o.terms.cancellation_email;
  return (
    <article className="wrap narrow prose">
      <h1>Terms of service</h1>
      <p className="fine">These terms apply to LaunchPad Local&apos;s AI phone receptionist service.</p>

      <h2>Month-to-month</h2>
      <p>The service is {o.terms.contract}. There is no long-term contract and no free trial.</p>

      <h2>Prices and billing</h2>
      <p>
        Current prices are on our <Link href="/#pricing">pricing section</Link>. You pay a one-time setup fee, then a monthly fee. Minutes
        beyond your plan are billed per minute at the rate shown for your plan.
      </p>
      {o.founding_offer.free_months > 0 ? (
        <>
          <h2>Founding offer</h2>
          <p>
            Our first {o.pricing_phase.founding_client_limit} paying clients get founding pricing{foundingOpen(o) ? "" : " (the founding spots are now full)"}.
            The setup fee is paid in full. The first month after your setup payment is free, and recurring monthly billing starts on
            the 1st of the second calendar month after your setup payment. For example, if you pay setup on any day in September, there
            is no charge in October and your first monthly charge is November 1.
          </p>
        </>
      ) : null}

      <h2>All sales are final</h2>
      <p>{o.terms.refunds}</p>

      <h2>Cancel anytime</h2>
      <p>
        {cancellationText(o).split(email).map((part, i, all) => (
          <span key={i}>
            {part}
            {i < all.length - 1 ? <a href={`mailto:${email}`}>{email}</a> : null}
          </span>
        ))}
      </p>

      <h2>Call recording and AI disclosure</h2>
      <p>
        Your receptionist tells every caller that it is an AI assistant and that the call may be recorded. See our{" "}
        <Link href="/privacy">privacy policy</Link> for how recordings are handled.
      </p>

      <h2>Questions</h2>
      <p>Email <a href={`mailto:${email}`}>{email}</a>.</p>
    </article>
  );
}
