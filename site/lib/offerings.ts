// Reads content/offerings.yaml (synced from config/offerings.yaml) at build time. Nothing about price is hard-coded:
// the site shows only what the file says, and only items with `available: true`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

type Money = Record<string, number>;
type Tier = {
  name: string;
  included_minutes: number;
  overage_per_min: number;
  features: string[];
  locations: number;
  founding: { setup: number; monthly: number };
  standard: { setup: number; monthly: number };
};
type Addon = { name: string; price: Money; available: boolean };
export type Offerings = {
  pricing_phase: { founding_client_limit: number; founding_clients_signed: number };
  tiers: Record<string, Tier>;
  founding_offer: { setup_waived: boolean; free_months: number; recurring_starts: string };
  terms: { contract: string; trial: string; refunds: string; cancellation: string; cancellation_email: string };
  services: Record<string, { name: string; summary: string; available: boolean }>;
  addons: Record<string, Addon>;
};

export function loadOfferings(file = join(process.cwd(), "content", "offerings.yaml")): Offerings {
  return parse(readFileSync(file, "utf8")) as Offerings;
}

export const usd = (n: number): string =>
  `$${Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2)}`;

export function foundingOpen(o: Offerings): boolean {
  return o.pricing_phase.founding_clients_signed < o.pricing_phase.founding_client_limit;
}

export function foundingSpotsLeft(o: Offerings): number {
  return Math.max(0, o.pricing_phase.founding_client_limit - o.pricing_phase.founding_clients_signed);
}

export function availableAddons(o: Offerings): [string, Addon][] {
  return Object.entries(o.addons).filter(([, a]) => a.available === true);
}

/** "$99/mo", "$199 one-time", "$199 setup + $49/mo". */
export function addonPrice(p: Money): string {
  const parts: string[] = [];
  if (p.one_time != null) parts.push(`${usd(p.one_time)} one-time`);
  if (p.setup != null) parts.push(`${usd(p.setup)} setup`);
  if (p.monthly != null) parts.push(`${usd(p.monthly)}/mo`);
  return parts.join(" + ");
}

const FEATURE_LABELS: Record<string, string> = {
  answering_24_7: "Answers every call, 24/7",
  faqs: "Answers questions from info you approve",
  messages: "Takes messages",
  text_email_summaries: "Text and email summary after each call",
  emergency_transfer: "Emergency calls transferred to your phone",
  appointment_time_requests: "Collects appointment time requests",
  monthly_report_tuning: "Monthly call report and tuning",
  bilingual_es: "Spanish and English",
};

export function featureLabel(key: string): string {
  return FEATURE_LABELS[key] ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function cancellationText(o: Offerings): string {
  return o.terms.cancellation.replaceAll("{cancellation_email}", o.terms.cancellation_email);
}
