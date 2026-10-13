// LaunchPad Local offer page (owner 2026-10-13): $499 one-page websites for local service businesses, plumbing and
// HVAC first. Every price and term comes from config/offerings.yaml (services.website_starter); nothing is invented.
import { Barlow_Condensed, Source_Sans_3 } from "next/font/google";
import LeadForm from "../components/LeadForm";
import { CONSENT_TEXT } from "../lib/lead.ts";
import { loadOfferings, usd, websiteOffer } from "../lib/offerings.ts";
import s from "./home.module.css";

const head = Barlow_Condensed({ subsets: ["latin"], weight: ["700"], variable: "--font-head", display: "swap" });
const body = Source_Sans_3({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-body", display: "swap" });

const o = loadOfferings();
const w = websiteOffer(o);

const STEPS: [string, string][] = [
  ["Quick call", "Ten minutes on the phone about your services, area and what you want customers to do."],
  ["Deposit and details", "You pay the 50% deposit and send your logo, photos, hours and service list."],
  ["Draft in 3–5 days", "We build the page and send you a private preview link to check on your phone."],
  ["One round of changes", "Tell us what to fix in one list. We make the changes and send it back."],
  ["Launch and handoff", "You pay the balance, we put it live and send a short guide to what you own."],
];

export default function Home() {
  if (!w) {
    return (
      <section className={s.sec}><div className={`${s.wrap} ${s.narrow}`}><h1 className={s.head}>LaunchPad Local</h1><p>Email <a href="mailto:tommy@launchpadlocal.org">tommy@launchpadlocal.org</a>.</p></div></section>
    );
  }
  const faqs: [string, string][] = [
    ["What do I need to send you?", "Your business name, phone number, service area, the services you offer, your hours, and a logo and a few photos if you have them. If you don't have photos, we'll talk through simple options."],
    ["How long does it take?", `Delivery is ${w.delivery}. The clock starts when everything is in.`],
    ["How do I pay?", `${w.payment}. Nothing is charged until we agree on the scope in writing.`],
    ["Will this get me more calls or rank me on Google?", "We can't promise rankings, traffic, leads or revenue, and nobody honest can. What you get is a fast, clear page with click-to-call, a working form and the basic on-page SEO done right."],
    ["Do I own the website?", "Yes. At handoff you get the files and the guide. You can host it with us on the care plan or move it anywhere."],
    ["I already have a website. Can you redo it?", "Yes. We rebuild it as one fast, clear page. If your current site has more than one page of content, we'll tell you up front what fits."],
    ["What if I need changes later?", `Small text and photo updates are part of the ${w.maintenance.name} (${usd(w.maintenance.price_monthly)}/month). Bigger changes are quoted first.`],
  ];
  return (
    <div className={`${s.page} ${head.variable} ${body.variable}`}>
      <section className={s.hero}>
        <div className={`${s.wrap} ${s.heroGrid}`}>
          <div>
            <h1 className={s.head}>A website that works as hard as your trucks do.</h1>
            <p className={s.lede}>
              One clean, fast page for your plumbing, HVAC or home-service business. Customers can see what you do, tap to call
              you, or send a request from their phone. Built in Jacksonville for {usd(w.price.build)}.
            </p>
            <div className={s.actions}>
              <a className={s.btn} href="#contact">Get my website</a>
              <a className={`${s.btn} ${s.btnQuiet}`} href="#sample">See a sample site</a>
            </div>
          </div>
          <aside className={s.ticket} aria-label="What the price includes">
            <div className={s.ticketTop}>
              <span className={s.head}>Estimate</span>
              <span className={s.ticketMeta}>LaunchPad Local<br />Jacksonville, FL</span>
            </div>
            <ul className={s.lines}>
              <li><span>One-page website, mobile-friendly</span><span>included</span></li>
              <li><span>Click-to-call buttons</span><span>included</span></li>
              <li><span>Contact form, tested before launch</span><span>included</span></li>
              <li><span>Basic on-page SEO</span><span>included</span></li>
              <li><span>One round of revisions</span><span>included</span></li>
              <li><span>Launch help and handoff guide</span><span>included</span></li>
            </ul>
            <div className={s.total}>
              <span>Total</span>
              <span className={s.head}>{usd(w.price.build)}</span>
            </div>
            <p className={s.terms}>{w.payment}.</p>
          </aside>
        </div>
      </section>

      <section className={s.sec} id="included">
        <div className={s.wrap}>
          <h2 className={s.head}>What you get, and what you don&apos;t</h2>
          <p className={s.sub}>{w.summary} Delivery is {w.delivery}.</p>
          <div className={s.cols}>
            <div>
              <h3>Included</h3>
              <ul className={s.list}>{w.includes.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div>
              <h3>Not included</h3>
              <ul className={`${s.list} ${s.listNo}`}>{w.excludes.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      <section className={`${s.sec} ${s.alt}`} id="sample">
        <div className={`${s.wrap} ${s.sample}`}>
          <div>
            <h2 className={s.head}>See what you&apos;d get</h2>
            <p className={s.sub}>
              This sample is a concept for a made-up plumbing company, built the same way we build yours: services up top,
              a big call button, a short request form and your service area.
            </p>
            <p><a className={s.link} href="/sample/riverside-plumbing/index.html" target="_blank" rel="noopener">Open the sample site in a new tab</a></p>
            <p className={s.small}>Riverside Plumbing Co. is not a real business. The sample has no real reviews, customers or results.</p>
          </div>
          <div className={s.phone}>
            <iframe src="/sample/riverside-plumbing/index.html" title="Sample plumbing website on a phone" loading="lazy" />
          </div>
        </div>
      </section>

      <section className={s.sec} id="how">
        <div className={s.wrap}>
          <h2 className={s.head}>How it works</h2>
          <ol className={s.steps}>
            {STEPS.map(([t, d]) => <li key={t}><h3>{t}</h3><p>{d}</p></li>)}
          </ol>
        </div>
      </section>

      <section className={`${s.sec} ${s.alt}`} id="care">
        <div className={`${s.wrap} ${s.narrow}`}>
          <div className={s.care}>
            <h2 className={s.head}>{w.maintenance.name} (optional)</h2>
            <p className={s.price}>{usd(w.maintenance.price_monthly)}/month</p>
            <ul className={s.list}>{w.maintenance.includes.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className={s.small}>Not included: {w.maintenance.excludes.join("; ").toLowerCase()}. {w.maintenance.terms}</p>
          </div>
        </div>
      </section>

      <section className={s.sec} id="faq">
        <div className={`${s.wrap} ${s.narrow} ${s.faq}`}>
          <h2 className={s.head}>Questions</h2>
          {faqs.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>

      <section className={`${s.sec} ${s.alt}`} id="contact">
        <div className={`${s.wrap} ${s.narrow}`}>
          <h2 className={s.head}>Get your website</h2>
          <p className={s.sub}>Tell us about your business. We&apos;ll reply within one business day to set up a quick call. No payment until we agree on the scope.</p>
          <LeadForm consentText={CONSENT_TEXT} />
        </div>
      </section>
    </div>
  );
}
