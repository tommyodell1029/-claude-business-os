---
name: sales-proposal
description: Generate a concise 2-4 page proposal for a local service business buyer for the AI receptionist service.
---

# Sales Proposal Generator

You generate professional, client-ready proposals for the AI receptionist service. Every proposal is short, concrete, and focuses on what the receptionist will do for THIS client based on their business and their own words from discovery.

## Invocation

```
/sales-proposal <client name>
```

Where `<client>` is the business name or owner. The skill generates a proposal document ready for delivery.

---

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

---

## Step 1: Gather Proposal Inputs

Collect the following information. Ask for each item explicitly. Do not generate a proposal with missing critical inputs.

### Required Inputs

1. **Business name and owner**: Legal name and owner/decision maker name
2. **Type of business**: What they do (e.g., plumbing, HVAC, dental practice)
3. **Current phone situation**: How do they handle calls now? How many calls do they miss? What are the pain points?
4. **Services the receptionist will deliver**: FAQ answers they want automated, whether they want booking, emergency transfer, etc. (from the discovery call — use their own words)
5. **Hours of operation and coverage needed**: 24/7 or specific hours? Nights? Weekends?
6. **Handoff method**: Who takes the transfer? Phone number for transfers?
7. **Setup timeline**: When can they start? (use {{SETUP_TIMELINE}} — do not invent days)
8. **Decision maker contact**: Email address for delivery only — use one they provided or published, never guessed

### Optional (Enhance Quality)

9. **Their estimate of missed calls per week**: For "Your numbers" ROI section
10. **Average job/service value**: For ROI impact calculation
11. **Other staff notes**: Office manager? Scheduling system?
12. **Competitive context**: Are they considering other solutions? (inform tone, not the content)

**If any required input is missing, ask the user. Do not invent it.**

---

## Step 2: Generate the Proposal

The proposal consists of 6 core sections. Keep the ENTIRE document under 4 pages.

### Writing Principles

1. **Lead with THEIR problem.** Start with the pain they described, in their own words.
2. **Specificity over generality.** "Handle your after-hours calls" is weak. "Answer calls Monday–Friday after 5 pm and all day Sunday with a live greeting and callback scheduling" is credible.
3. **Use their language.** If they said "we lose jobs because prospects can't reach us," use that phrase back to them.
4. **Keep it short.** Busy owners do not read long proposals. Every sentence must earn its place.
5. **Focus on what the receptionist DOES, not promises.** Describe capabilities; do not guarantee outcomes.

---

## Section 1: Cover Page (1/4 page)

```
LaunchPad Local

PROPOSAL FOR [BUSINESS NAME]

Your 24/7 AI Receptionist

Prepared for: [Owner/Manager Name]
Prepared by: LaunchPad Local
Date: [Today's date]
Valid Until: [Date + 30 days]
```

---

## Section 2: What We Heard (1/2 page)

Demonstrate you listened. Use their exact words and specific details from the discovery call.

```
### What We Heard

In our conversation on [date], you shared:

- [Their pain point 1, in their words] — calls come in [timing] when [person] cannot answer
- [Their pain point 2, in their words] — [specific scenario they described]
- [Their specific goal, in their words] — [what they want to be able to do]

This is a common challenge for [business type]. Missed calls mean lost jobs, customer frustration, and the prospect goes to a competitor instead.
```

**Rule:** Every bullet must quote or closely paraphrase what they actually said. Do not invent pain points.

---

## Section 3: What the Receptionist Will Do for You (1 page)

This is the core of the proposal. Describe their receptionist in concrete, actionable terms based on their business setup.

```
### What the Receptionist Will Do for You

The AI receptionist will:

**24/7 Call Handling** — Answer calls [specific hours they need covered] with a live greeting: "Hi, you've reached [Business Name]. This is an AI receptionist. This call may be recorded. How can I help?"

**Answer Your FAQs** — Respond to common questions about [specific topics they mentioned]: hours, services, pricing, how to book, etc. You control exactly what it knows.

**Collect Caller Info** — Get the caller's name, phone, and reason for calling. You receive a text and email summary within minutes.

**Book Appointments** [if applicable] — If a caller wants to schedule, the receptionist books them into your [calendar system / method they described] in real time.

**Handle Emergencies** — If a caller says it's urgent or asks to speak to you, the receptionist transfers them to [phone number you provide] immediately.

**After Hours Flexibility** — You approve all the information the receptionist uses. Change FAQs, add new services, or adjust coverage anytime.

Every call summary comes to you by text and email. You decide how to follow up.
```

**Rules:**
- Fill in bracketed items with specifics from the discovery call.
- Only include "Book Appointments" if they asked for it.
- Only include "Emergency Transfer" if it's part of your setup.
- Do not make promises about outcomes ("Never miss a lead again"). Describe what it does.

---

## Section 4: Setup and Timeline (1/4 page)

```
### Setup and Timeline

**Step 1: Configuration** — You provide a list of FAQs, hours, services, and your transfer phone number.

**Step 2: Training** — The receptionist learns your business, your tone, and your rules.

**Step 3: Go Live** — Your number routes inbound calls to the receptionist. You start receiving summaries.

**Timeline:** {{SETUP_TIMELINE}}

You control the cutover. Test it first, go live when you're ready. Month-to-month: cancel anytime by email; billing stops after the period already paid. All sales are final (no refunds).
```

---

## Section 5: Investment

```
### Investment

{{PRICE from config/offerings.yaml}}

Includes:
- 24/7 call handling
- Text and email summaries after every call
- [Appointment booking if applicable]
- [Emergency transfer if applicable]
- Full control over FAQ content
- Terms: month-to-month, cancel anytime by email, all sales final (no refunds)
```

---

## Section 6: Your Numbers (ROI — only if they provided figures)

```
### What This Means for Your Business

Based on what you shared:
- You currently miss approximately [your estimate] calls per [week/month]
- Average job/service value: [your estimate]
- Lost opportunity: [their estimate] × [their estimate] = $X per [period]

**If the receptionist captures just [conservative %] of those missed calls:**
- Recovered revenue per [period]: $X
- Annual investment: {{PRICE from config/offerings.yaml}} × 12 = $X
- Net impact: $X — $X = $X per year

This uses your estimates. Real results depend on your follow-up, market, and how prospects respond. The receptionist provides the data so you can measure it yourself.
```

**Rules:**
- Only include this section if the prospect gave you numbers.
- Label every figure "your estimate."
- Show the formula so it is transparent.
- Do not project percentages they did not give you.
- Acknowledge that their follow-up and market matter.

---

## Section 7: Next Steps (1/4 page)

```
### Next Steps

1. **Review this proposal** — Read through and share with anyone else involved in the decision.

2. **Try the demo** — Call {{DEMO_PHONE}} to hear how the AI greets callers and see the experience firsthand.

3. **Ask questions** — Call or email me. Nothing about the setup is locked in. We can adjust hours, FAQs, transfer method, anything.

4. **Go live** — Once you are ready, we set a go-live date. Setup takes {{SETUP_TIMELINE}}.

### Ready to Talk?

Tommy Odell
LaunchPad Local
{{CONTACT_EMAIL}}
{{CONTACT_PHONE}}

*This proposal is valid until [date + 30 days]. After that, pricing and availability may change.*
```

---

## Step 3: Required Inputs Checklist

**Before you generate the proposal, confirm with the user:**

```
### Required Inputs Checklist

- [ ] Business name
- [ ] Owner/decision maker name and email
- [ ] Type of business
- [ ] Current phone pain points (their words)
- [ ] Services the receptionist should handle
- [ ] Hours of coverage needed
- [ ] Transfer phone number or method
- [ ] Estimated go-live date

**Missing any of these? Ask the user now. Do not proceed without them.**
```

---

## Output Format

Write the complete proposal to `sales/[BUSINESS-SLUG]-PROPOSAL.md` where `[BUSINESS-SLUG]` is a short identifier (e.g., `acme-plumbing-PROPOSAL.md`).

```markdown
# Proposal: [Business Name] — AI Receptionist

LaunchPad Local

[Cover page info]

---

## What We Heard

[Their specific pains and goals]

---

## What the Receptionist Will Do for You

[Concrete capabilities for their business]

---

## Setup and Timeline

[Steps and {{SETUP_TIMELINE}}]

---

## Investment

[{{PRICE from config/offerings.yaml}}]

---

## Your Numbers

[ROI math if applicable — only with their figures]

---

## Next Steps

[Clear action items and contact]
```

---

## Rules and Constraints

1. **Keep under 4 pages.** Busy owners do not read long documents. Every section must justify its space.
2. **Never invent pain points or figures.** Use only what they told you or what you can cite.
3. **This is about THEIR business, not LaunchPad.** Lead with their problem and their language.
4. **No team bios, case studies, or logos.** Those sections do not apply here. The live demo is the proof.
5. **Anchor pricing in context.** Show how investment relates to the opportunity they described.
6. **If critical inputs are missing, ask.** Do not fill gaps with guesses.
7. **Every word serves the close.** Remove anything that does not move them toward a decision.
