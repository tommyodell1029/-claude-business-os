<!-- Canonical guardrails block. Pasted verbatim into every sales-* SKILL.md. Edit here first, then re-sync. -->
## LaunchPad Local context (read first)
- **Seller:** LaunchPad Local, an AI receptionist agency in Jacksonville, FL (launchpadlocal.org).
- **Product:** an inbound AI phone receptionist. It answers a local business's calls 24/7 and discloses that it is an AI and that the call may be recorded. It answers FAQs only from information the business has approved, collects the caller's details, books appointments where booking is enabled, transfers emergencies or callers who ask for a person to the owner, and sends the owner a text and email summary after every call.
- **Buyers:** owner-operated local businesses in Jacksonville, Orange Park, St. Augustine, Fernandina Beach and Ponte Vedra: plumbing, HVAC, roofing, electrical, law firms, med spas, dental, chiropractic, real estate and insurance. The decision maker is usually the owner or office manager. There is no buying committee.
- **Live demo:** prospects can call the AI themselves at {{DEMO_PHONE}}.

## Guardrails (never break these)
1. **No invented facts.** Use only what the user provides, what the prospect's own website or public listings say, or sourced web research, and cite the URL. If something is unknown, write "Unknown", or ask the user.
2. **Prices come only from `config/offerings.yaml`.** Quote the founding price while `founding_clients_signed` is below 5, otherwise the standard price. Founding offer: setup fee paid in full, the next month free, monthly billing starts the 1st of the second month after setup. Only offer add-ons marked `available: true`. Never invent a price, discount, or term; terms come from `config/offerings.yaml` `terms`: month-to-month, no trial, all sales final (no refunds), cancel anytime by email. Never estimate a competitor's price unless a cited public source states it.
3. **No fabricated proof.** Never write or suggest case studies, testimonials, client logos, "businesses like yours saw X%" claims, benchmarks or ROI figures unless the user supplies them. LaunchPad Local has no published case studies. Offer the live demo number as the proof instead.
4. **ROI is the prospect's own math.** Any ROI section uses inputs the prospect gave (for example, missed calls per week and average job value). It must show the formula and label every figure as the prospect's estimate.
5. **Never guess email addresses** or infer email patterns. Use only an address the person published or gave us.
6. **Channels.** Email may go to people who have engaged with us or who came through a compliant cold-email sequence. Phone calls and voicemails are made manually by the owner, only to people who asked for a call or are mid-conversation. Texts go only to people who gave written consent (for example, through the website form's consent checkbox). No LinkedIn automation. No bulk messaging.
7. **Promises.** Never promise results, uptime, revenue or "never miss a call". Describe what the product does, not outcomes.
8. **Compliance.** Any email that is not a one-to-one reply includes {{MAILING_ADDRESS}} and an opt-out line. Florida is an all-party-consent state, so the AI always discloses recording. Mention this when a prospect asks about legality.
9. **Output files** go in `sales/` at the repo root (create it if missing) and never contain API keys or passwords.
