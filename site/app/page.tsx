import Link from "next/link";
import LeadForm from "../components/LeadForm";
import { CONSENT_TEXT } from "../lib/lead.ts";
import {
  addonPrice, availableAddons, cancellationText, featureLabel, foundingOpen, foundingSpotsLeft, loadOfferings, usd,
} from "../lib/offerings.ts";
import { demoPhone } from "../lib/phone.ts";

const o = loadOfferings();
const founding = foundingOpen(o);
const spots = foundingSpotsLeft(o);
const demo = demoPhone();
const addons = availableAddons(o);
const email = o.terms.cancellation_email;
const tiers = Object.entries(o.tiers);
const overage = (t: { overage_per_min: number }) => `${usd(t.overage_per_min)}/min`;

const ADDON_NOTES: Record<string, string> = {
  gbp_setup: "We set up and clean up your Google Business Profile so customers find the right hours, number and details.",
  extra_number: "Add another phone number or location. Each one gets its own set of approved answers.",
  bilingual_es: "Your receptionist answers in Spanish or English. Included in Scale.",
};

const faqs: { q: string; a: string }[] = [
  {
    q: "Does the caller know it is an AI?",
    a: "Yes. Every call starts by saying it is your AI assistant and that the call may be recorded. Florida requires everyone on a call to agree to recording, and this is how we handle it.",
  },
  {
    q: "What does it say when it does not know the answer?",
    a: "It only answers from the information you approve: your hours, services, service area and common questions. It does not guess prices, availability or promises. If it does not know, it takes a message and you follow up.",
  },
  {
    q: "What happens in an emergency?",
    a: "If a caller describes an emergency, such as a flood or a gas smell, the receptionist tries to connect them to your phone right away. If nobody picks up, it takes an urgent message and flags it in your summary.",
  },
  {
    q: "How do I find out who called?",
    a: "After each call we text and email you a short summary with the caller's name, number and what they need.",
  },
  {
    q: "What if we go over our included minutes?",
    a: `Extra minutes are billed at ${tiers.map(([, t]) => `${overage(t)} on ${t.name}`).join(", ")}.`,
  },
  {
    q: "Is there a contract?",
    a: `No. Service is ${o.terms.contract}. There is no free trial. ${cancellationText(o)}`,
  },
  {
    q: "Do you offer refunds?",
    a: `${o.terms.refunds} Please read the full terms before you buy.`,
  },
  {
    q: "Does it make outbound calls?",
    a: "No. LaunchPad Local receptionists answer your incoming calls only.",
  },
  {
    q: "How does it connect to my phone number?",
    a: "We set that up with you at onboarding and walk through the options on our first conversation.",
  },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="badge"><span className="dot" aria-hidden="true" /> Always on, nights and weekends included</p>
            <h1>Never miss a customer call again.</h1>
            <p className="lede">
              LaunchPad Local gives Jacksonville home-service and other local businesses an AI phone receptionist. It answers every
              call, answers common questions, takes messages, sends real emergencies to your phone, and texts you a summary.
            </p>
            <div className="cta">
              <a className="btn" href="#contact">Talk to us</a>
              <a className="btn ghost" href="#pricing">See pricing</a>
            </div>
          </div>
          {demo ? (
            <aside className="demo" aria-label="Demo line">
              <h2>Call our demo</h2>
              <p>Hear it yourself. Our demo receptionist answers for a fictional Jacksonville home-services company.</p>
              <a className="demo-num" href={`tel:${demo.tel}`}>{demo.display}</a>
              <p className="fine">The call is answered by an AI assistant and may be recorded.</p>
            </aside>
          ) : (
            <aside className="demo" aria-label="Summary">
              <h2>What you get</h2>
              <ul className="ticks">
                <li>Calls answered 24/7, not sent to voicemail</li>
                <li>Answers only from info you approve</li>
                <li>Emergencies transferred to your phone</li>
                <li>Text and email summary after every call</li>
              </ul>
            </aside>
          )}
        </div>
      </section>

      <section className="sec" id="what">
        <div className="wrap">
          <h2>Built for busy local trades</h2>
          <p className="sub">When you are on a job, under a sink or on a roof, the phone still rings. A missed call is often a customer who calls the next company on the list.</p>
          <div className="cards">
            <article><h3>Answers like a front desk</h3><p>Greets callers, tells them your hours and service area, and answers the questions you have approved.</p></article>
            <article><h3>Takes the message for you</h3><p>Collects the caller&apos;s name, number and what they need, and reads the number back to be sure it is right.</p></article>
            <article><h3>Knows when to hand off</h3><p>Emergency calls are transferred to your phone. Wrong numbers and sales calls are ended politely.</p></article>
            <article><h3>Keeps you in the loop</h3><p>A short text and email lands on your phone after each call, so you can call back in one tap.</p></article>
          </div>
        </div>
      </section>

      <section className="sec alt" id="how">
        <div className="wrap">
          <h2>How it works</h2>
          <ol className="steps">
            <li><h3>We learn your business</h3><p>You give us your hours, services, service area and answers to common questions. We build your receptionist from that and nothing else.</p></li>
            <li><h3>We connect your line</h3><p>We set up your receptionist to answer your calls and test it with you before it goes live.</p></li>
            <li><h3>It answers, you follow up</h3><p>Callers get a friendly answer any hour of the day. You get a summary and call back the ones who need you.</p></li>
          </ol>
        </div>
      </section>

      <section className="sec" id="pricing">
        <div className="wrap">
          <h2>Simple monthly pricing</h2>
          <p className="sub">
            {founding ? (
              <>
                <strong>Founding pricing</strong> is for our first {o.pricing_phase.founding_client_limit} clients ({spots} of {o.pricing_phase.founding_client_limit} spots open).
                Founding clients pay the setup fee up front, and the first month after setup is free. Standard prices apply from client #{o.pricing_phase.founding_client_limit + 1}.
              </>
            ) : (
              <>Setup fee once, then a flat monthly price. Minutes beyond your plan are billed per minute.</>
            )}{" "}
            {o.terms.contract === "month-to-month" ? "Month-to-month, no trial, all sales final." : ""}{" "}
            <Link href="/terms">Read the terms.</Link>
          </p>
          <div className="plans">
            {tiers.map(([key, t]) => {
              const p = founding ? t.founding : t.standard;
              return (
                <article className="plan" key={key}>
                  {founding ? <p className="tag">Founding price</p> : null}
                  <h3>{t.name}</h3>
                  <p className="price"><span>{usd(p.monthly)}</span>/month</p>
                  <p className="setup">{usd(p.setup)} one-time setup</p>
                  {founding ? <p className="was">Standard price from client #{o.pricing_phase.founding_client_limit + 1}: {usd(t.standard.monthly)}/month</p> : null}
                  <ul className="ticks">
                    <li>{t.included_minutes.toLocaleString("en-US")} minutes a month included</li>
                    <li>Then {overage(t)}</li>
                    <li>{t.locations === 1 ? "1 location" : `Up to ${t.locations} locations`}</li>
                    {t.features.map((f) => <li key={f}>{featureLabel(f)}</li>)}
                  </ul>
                  <a className="btn" href="#contact">Get started</a>
                </article>
              );
            })}
          </div>
          {founding ? (
            <p className="fine center">
              Founding offer: setup is paid in full. The first month after setup is free, and monthly billing starts on the 1st of the
              second month after your setup payment.
            </p>
          ) : null}
        </div>
      </section>

      {addons.length > 0 ? (
        <section className="sec alt" id="addons">
          <div className="wrap">
            <h2>Add-ons</h2>
            <div className="cards">
              {addons.map(([key, a]) => (
                <article key={key}>
                  <h3>{a.name}</h3>
                  <p className="addon-price">{addonPrice(a.price)}</p>
                  {ADDON_NOTES[key] ? <p>{ADDON_NOTES[key]}</p> : null}
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="sec" id="faq">
        <div className="wrap narrow">
          <h2>Questions</h2>
          {faqs.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="sec alt" id="contact">
        <div className="wrap narrow">
          <h2>Talk to us</h2>
          <p className="sub">Tell us about your business and how we can reach you. You can also email <a href={`mailto:${email}`}>{email}</a>.</p>
          <LeadForm consentText={CONSENT_TEXT} />
        </div>
      </section>
    </>
  );
}
