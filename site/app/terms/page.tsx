import type { Metadata } from "next";
import Link from "next/link";
import { cancellationText, foundingOpen, loadOfferings, usd, websiteOffer } from "../../lib/offerings.ts";

export const metadata: Metadata = { title: "Terms of service" };
const o = loadOfferings();
const w = websiteOffer(o);

export default function Terms() {
  const email = o.terms.cancellation_email;
  return (
    <article className="wrap narrow prose">
      <h1>Terms of service</h1>
      <p className="fine">
        These terms cover LaunchPad Local&apos;s {w ? <><a href="#websites">website services</a> and </> : null}<a href="#receptionist">AI phone receptionist service</a>.
        If your written quote says something different, the quote wins for your project.
      </p>

      {w ? (
        <section id="websites">
          <h2>Website services</h2>

          <h3>What&apos;s included</h3>
          <p>
            Your written quote sets the scope. Our standard {w.name.toLowerCase()} is {usd(w.price.build)} and includes:{" "}
            {w.includes.map((x) => x.toLowerCase()).join("; ")}. Anything else is only included if the quote says so.
          </p>
          <p>Not included unless your quote says otherwise: {w.excludes.map((x) => x.toLowerCase()).join("; ")}.</p>

          <h3>Payment</h3>
          <p>{w.payment}. We send each invoice by email. We don&apos;t start work before the deposit is paid, and we don&apos;t launch or hand off the site before the balance is paid.</p>

          <h3>Timeline</h3>
          <p>
            Delivery is {w.delivery}. If content, photos, approvals or access arrive late, the timeline moves by the same amount.
          </p>

          <h3>Revisions</h3>
          <p>One round of revisions is included: send your changes in one list and we make them. {w.revisions_extra}</p>

          <h3>Refunds</h3>
          <p>{w.refunds}</p>

          <h3>Your content</h3>
          <p>
            You confirm you have the right to use the logos, photos and text you send us, and that business details such as license
            numbers, service areas and hours are accurate. We don&apos;t make up reviews, ratings, licenses or results for your site. We only
            show reviews you choose, with a link to where they were posted.
          </p>

          <h3>Ownership</h3>
          <p>
            Once the site is paid in full, you own its files and content, and we hand them over with a short guide. We don&apos;t
            use your site in our own marketing without your permission.
          </p>

          <h3>Domains and hosting</h3>
          <p>
            Domain registration and any third-party subscriptions are yours to pay and keep. We only change domain or DNS settings with
            your permission. If you aren&apos;t on the care plan, hosting after launch is your responsibility. We&apos;ll help you set it up at handoff.
          </p>

          <h3>{w.maintenance.name}</h3>
          <p>
            Optional, {usd(w.maintenance.price_monthly)} per month. Includes {w.maintenance.includes.map((x) => x.toLowerCase()).join("; ")}.
            Not included: {w.maintenance.excludes.map((x) => x.toLowerCase()).join("; ")}. {w.maintenance.terms} Cancelling stops future
            billing; the plan continues until the end of the month already paid.
          </p>

          <h3>No guarantees of results</h3>
          <p>
            We build a fast, clear website and test that its call buttons and form work before launch. We don&apos;t guarantee search rankings,
            traffic, calls, leads or revenue. Services we don&apos;t control (domain registrars, hosting providers, Google and email providers)
            can have outages or change their rules.
          </p>

          <h3>Sample sites</h3>
          <p>Sample and concept sites on our website are for made-up businesses. They don&apos;t show real customers, reviews or results.</p>
        </section>
      ) : null}

      <section id="receptionist">
      <h2>AI phone receptionist</h2>
      <h3>Month-to-month</h3>
      <p>The service is {o.terms.contract}. There is no long-term contract and no free trial.</p>

      <h3>Prices and billing</h3>
      <p>
        Prices are in your written quote or onboarding link. You pay a one-time setup fee, then a monthly fee. Minutes beyond your
        plan are billed per minute at the rate shown for your plan.
      </p>
      {o.founding_offer.free_months > 0 ? (
        <>
          <h3>Founding offer</h3>
          <p>
            Our first {o.pricing_phase.founding_client_limit} paying clients get founding pricing{foundingOpen(o) ? "" : " (the founding spots are now full)"}.
            The setup fee is paid in full. The first month after your setup payment is free, and recurring monthly billing starts on
            the 1st of the second calendar month after your setup payment. For example, if you pay setup on any day in September, there
            is no charge in October and your first monthly charge is November 1.
          </p>
        </>
      ) : null}

      <h3>All sales are final</h3>
      <p>{o.terms.refunds}</p>

      <h3>Cancel anytime</h3>
      <p>
        {cancellationText(o).split(email).map((part, i, all) => (
          <span key={i}>
            {part}
            {i < all.length - 1 ? <a href={`mailto:${email}`}>{email}</a> : null}
          </span>
        ))}
      </p>

      <h3>Call recording and AI disclosure</h3>
      <p>
        Your receptionist tells every caller that it is an AI assistant and that the call may be recorded. See our{" "}
        <Link href="/privacy">privacy policy</Link> for how recordings are handled.
      </p>

      </section>

      <h2>Questions</h2>
      <p>Email <a href={`mailto:${email}`}>{email}</a>.</p>
    </article>
  );
}
