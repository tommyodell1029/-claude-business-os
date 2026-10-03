import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LaunchPad Local | AI phone receptionist for Jacksonville businesses", template: "%s | LaunchPad Local" },
  description:
    "An AI phone receptionist that answers every call for Jacksonville local service businesses, takes messages, transfers emergencies and texts you a summary.",
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
              <Link href="/#how">How it works</Link>
              <Link href="/#pricing">Pricing</Link>
              <Link href="/#faq">FAQ</Link>
              <Link href="/#contact" className="btn small">Contact us</Link>
            </nav>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="foot">
          <div className="wrap foot-grid">
            <div>
              <strong>LaunchPad Local</strong>
              <p>AI phone receptionists for local service businesses in Jacksonville, FL.</p>
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
