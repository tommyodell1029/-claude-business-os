import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { loadOfferings, usd, websiteOffer } from "../lib/offerings.ts";

const offer = websiteOffer(loadOfferings());

export const metadata: Metadata = {
  title: { default: "LaunchPad Local", template: "%s | LaunchPad Local" },
  description: offer
    ? `Fast, mobile-friendly one-page websites for plumbing, HVAC and home-service businesses in Jacksonville, FL. ${usd(offer.price.build)}.`
    : "LaunchPad Local, Jacksonville, Florida.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  const mailing = process.env.MAILING_ADDRESS?.trim();
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="top">
          <div className="wrap bar">
            <Link href="/" className="brand">LaunchPad Local</Link>
            <nav aria-label="Main">
              <Link href="/#contact" className="btn small nav-cta">Get a website</Link>
            </nav>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="foot">
          <div className="wrap foot-grid">
            <div>
              <strong>LaunchPad Local</strong>
              <p>Jacksonville, FL.</p>
              {mailing ? <p className="addr">{mailing}</p> : null}
            </div>
            <ul>
              <li><Link href="/terms">Terms of service</Link></li>
              <li><Link href="/privacy">Privacy policy</Link></li>
            </ul>
          </div>
        </footer>
      </body>
    </html>
  );
}
