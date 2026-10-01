---
name: sales-prep
description: Prepare for a 15-20 minute demo call with a local business owner to sell an inbound AI phone receptionist.
---

# Sales Meeting Prep: AI Receptionist Demo Call

This guide helps you prepare for a demo call with a local business owner interested in an inbound AI phone receptionist. The goal is to understand their call volume, pain points, and decision-making timeline in 15-20 minutes, then offer a live walkthrough of the AI receptionist itself.

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

## Invocation

```
/sales-prep <prospect url or name>
```

Where `<prospect url or name>` is the business's website or name. You may also provide:
- Owner or office manager name
- Call date and time
- Initial pain point mentioned (if any)

---

## Pre-Call Preparation

### 1. Research the Business (5 minutes)

Fetch the prospect's website and note:
- What service they provide (plumbing, HVAC, law firm, etc.)
- Service area and locations
- Hours of operation (to gauge after-hours volume)
- Whether they mention a phone number prominently (signals it's important)
- Any mention of online booking or appointment systems

Do NOT spend time on competitive research or market sizing. Focus only on their business model.

### 2. Identify Call Volume Indicators (3 minutes)

Look for clues about inbound call volume:
- Do they advertise a phone number on every page? → High call dependency
- Do they have an online booking system? → May have adequate capture, but missed calls still hurt
- Service area coverage? → Larger = more call traffic
- Type of business: emergency services (electrical, plumbing, law) = high after-hours volume; routine services (med spa, dental) = lower

### 3. Create Your Call Notes

Write a one-page cheat sheet with:
- **Business name & type**
- **Owner/manager name** (if known)
- **Call volume indicator** (high / medium / low — your estimate from research)
- **After-hours indicator** (24/7 needed / business hours only)
- **Key question to open with** (e.g., "How many inbound calls do you get on a busy day?")

---

## The 15-20 Minute Demo Call Structure

### Opening (1 minute)
"Hi [Name], thanks for taking the call. I know you're busy, so I'll be direct. We've built an AI phone receptionist that answers calls 24/7, collects caller details, and books appointments when you want it to. I'd like to understand your call situation in the next 15 minutes, then have you call our demo line live so you can hear exactly what your callers would experience. Sound good?"

### Discovery Questions (8-10 minutes)

Ask in this order — adapt based on their answers:

1. **Call volume baseline.** "On your busiest day, roughly how many inbound calls do you get? And how many do you think you actually miss — calls that go to voicemail?"

2. **After-hours pattern.** "Do you get calls after hours or on weekends? How many of those are genuine emergencies versus just someone trying to schedule?"

3. **Who answers today.** "Who's answering your phones right now — you, an employee, an answering service, or a mix?"

4. **Missed call cost.** "When a caller can't reach you, what happens? Do they call a competitor, or try again later?" (Listen for: job loss, rescheduling burden, frustration.)

5. **Appointment booking.** "How do people book appointments with you now? Phone, email, online form, text?"

6. **Busy season.** "Do you have a busy season where call volume spikes and staff is stretched?"

7. **Emergencies.** "In your line of work, what counts as an emergency? How do you want those handled differently?"

8. **Current frustration.** "What's the biggest pain point with how you handle calls today?"

### Live Demo (5 minutes)

"Here's what I want you to do — I'm going to give you a number to call right now, and I want you to call it as if you're a customer. Go ahead. I'll wait." 

Provide {{DEMO_PHONE}}.

**What they'll experience:**
- AI greeting identifying itself as an AI and disclosing recording
- Option to request a person or report an emergency
- Request for their name and reason for calling
- Confirmation that they'll receive a summary

**During the call, you stay silent.** Let them experience it live. This is the proof.

### Objection/Question Handling (2-3 minutes)

After they call, they'll have questions:
- "Is recording legal in Florida?" → Yes, because Florida is all-party-consent. The AI says so at the start.
- "What if it misunderstands?" → It can transfer to you immediately. You listen in. The call summary is always sent.
- "How much does it cost?" → {{PRICE from config/offerings.yaml}}. 
- "Can it handle my specific FAQs?" → Yes, you provide them. We update it anytime.

### Close (1 minute)

"What did you think?" Listen to their first reaction. Then:

- **If engaged:** "I'd like to show you the dashboard where you configure FAQs and see call summaries. Can we schedule 30 minutes next week?"
- **If hesitant:** "Any questions I can answer right now?"
- **If ready to move:** "Here's how we'd start: I'd send you a questionnaire about your FAQs, availability, and booking preferences. We'd have you live within [timeframe]."

---

## Talking Points (only if needed)

Use these only if discovery stalls or they go off-topic. Never open with them.

- **After-hours calls cost money.** Ask what happens today when a call comes in at 10 PM. Use their answer, then explain that the AI answers after hours, takes the details, and texts and emails them a summary.
- **Details matter.** "When a caller leaves a voicemail, you get a summary. When the AI takes the call, you get their name, phone, reason, and a transcript. Better intel."
- **Booking saves overhead.** "If the AI books when you're available, you're not scrambling to schedule callbacks."

---

## Objections You'll Likely Hear (& Quick Responses)

See `OBJECTION-PLAYBOOK.md` for full responses. Quick versions:

1. **"Customers hate robots."** → They'll hear it's an AI upfront. If a caller asks for a person, the AI transfers them to the owner's handoff number, and takes a message if nobody answers. Have them hear it on the demo line.
2. **"What if it messes up?"** → It transfers to you immediately on request. You get a full transcript either way.
3. **"Is it legal?"** → Yes in Florida. The AI says it's recording at the start.
4. **"I don't get that many calls."** → Even 5 missed calls per month costs you. The AI also handles routine questions so you spend less time on the phone.
5. **"Too expensive."** → It costs {{PRICE from config/offerings.yaml}}. That's less than one full-time employee. Call the demo first, then we talk pricing.

---

## Success Metrics for This Call

**Minimum success:** They call the demo line and understand what the product does.
**Target success:** They agree to a 30-minute follow-up to discuss setup and pricing.
**Stretch success:** They agree to start: the founding offer (setup now, the following month free) while founding spots remain. There is no trial.

---

## Notes for You

- **This is a demo call, not a discovery deep-dive.** You're showing, not selling.
- **Let them call the demo line.** Watching their face when they hear it is worth more than any pitch.
- **Objections are normal.** Most come down to trust. The demo builds it.
- **One next step only.** Don't propose three options. Suggest a 30-minute follow-up. If they want to move faster, they'll tell you.
- **After-hours calls are the hook.** If they're open past 5 PM or have emergency calls, this solves a real problem. Lead with that when you identify it.
