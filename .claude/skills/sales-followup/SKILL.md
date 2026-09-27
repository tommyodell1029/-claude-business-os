---
name: sales-followup
description: Generate follow-up touchpoints for prospects after demo, proposal, or initial contact with the AI receptionist service.
---

# Follow-Up Sequence Generator

You generate follow-up sequences for local service business owners after they have had a demo, seen a proposal, or gone silent. Every email adds value, references specific details from your conversation, and includes one clear next step. Phone and voicemail scripts are for the owner to use manually, only with people who asked to speak or are mid-conversation.

## Invocation

```
/sales-followup <prospect name>
```

Where `<prospect>` is the business name or owner name. The skill generates a complete follow-up sequence ready to execute.

---

## LaunchPad Local context (read first)
- **Seller:** LaunchPad Local, an AI receptionist agency in Jacksonville, FL (launchpadlocal.org).
- **Product:** an inbound AI phone receptionist. It answers a local business's calls 24/7 and discloses that it is an AI and that the call may be recorded. It answers FAQs only from information the business has approved, collects the caller's details, books appointments where booking is enabled, transfers emergencies or callers who ask for a person to the owner, and sends the owner a text and email summary after every call.
- **Buyers:** owner-operated local businesses in Jacksonville, Orange Park, St. Augustine, Fernandina Beach and Ponte Vedra: plumbing, HVAC, roofing, electrical, law firms, med spas, dental, chiropractic, real estate and insurance. The decision maker is usually the owner or office manager. There is no buying committee.
- **Live demo:** prospects can call the AI themselves at {{DEMO_PHONE}}.

## Guardrails (never break these)
1. **No invented facts.** Use only what the user provides, what the prospect's own website or public listings say, or sourced web research, and cite the URL. If something is unknown, write "Unknown", or ask the user.
2. **No invented pricing.** Always write {{PRICING}}. Never estimate our price or a competitor's unless a cited public source states it.
3. **No fabricated proof.** Never write or suggest case studies, testimonials, client logos, "businesses like yours saw X%" claims, benchmarks or ROI figures unless the user supplies them. LaunchPad Local has no published case studies. Offer the live demo number as the proof instead.
4. **ROI is the prospect's own math.** Any ROI section uses inputs the prospect gave (for example, missed calls per week and average job value). It must show the formula and label every figure as the prospect's estimate.
5. **Never guess email addresses** or infer email patterns. Use only an address the person published or gave us.
6. **Channels.** Email may go to people who have engaged with us or who came through a compliant cold-email sequence. Phone calls and voicemails are made manually by the owner, only to people who asked for a call or are mid-conversation. Texts go only to people who gave written consent (for example, through the website form's consent checkbox). No LinkedIn automation. No bulk messaging.
7. **Promises.** Never promise results, uptime, revenue or "never miss a call". Describe what the product does, not outcomes.
8. **Compliance.** Any email that is not a one-to-one reply includes {{MAILING_ADDRESS}} and an opt-out line. Florida is an all-party-consent state, so the AI always discloses recording. Mention this when a prospect asks about legality.
9. **Output files** go in `sales/` at the repo root (create it if missing) and never contain API keys or passwords.

---

## Step 1: Gather Follow-Up Context

Ask the user for this information before generating the sequence:

1. **Prospect name and business**
2. **Interaction type**: Demo, Proposal, or Silent (Ghost)
3. **Date of last interaction**
4. **Key discussion points** from the call or meeting (at least 2 specific items they mentioned)
5. **Prospect temperature**: Hot (engaged, asked questions), Warm (interested but slow), Cold (ghosted)

---

## Step 2: Select Follow-Up Scenario

Choose the scenario that matches their interaction type. Ask the user if unclear.

---

## Scenario 1: Post-Demo Follow-Up (3 Emails)

**Use this after:** The prospect called {{DEMO_PHONE}}, heard the demo, or you walked them through the receptionist live.

### Email 1 — Recap + Next Step (Send: Within 2 hours of demo)

**Word count:** 80–100 words

**Body:**

Hi [First Name],

Thanks for taking the time to hear the demo. I heard you were particularly interested in [specific thing they asked about or reacted to].

Here is what happens next:

- The receptionist handles calls [specific hours they need]
- Answers FAQs about [specific services they mentioned]
- Sends you a text and email summary after every call
- You control what it knows — change anything anytime

Questions? Call me or reply here.

[Your name]

---

### Email 2 — Address a Concern (Send: 3 days after Email 1)

**Word count:** 60–80 words

**Body:**

Hi [First Name],

One thing that comes up a lot: [specific concern they raised or you anticipate].

Here is how it works: [brief, specific answer using their situation].

The best way to see it is to try it yourself. Call {{DEMO_PHONE}} again and [specific action — e.g., "ask it to book an appointment" or "see how it handles an emergency transfer request"].

Let me know what you think.

[Your name]

---

### Email 3 — Direct Ask (Send: 5 days after Email 2)

**Word count:** 70–90 words

**Body:**

Hi [First Name],

Where do you stand on [specific goal they mentioned — e.g., "handling after-hours calls"]?

If you want to move forward, setup takes {{SETUP_TIMELINE}}. We can pilot it for a week and expand from there if you like.

If now is not the right time, I get it. But [one factual reason — e.g., "many places are busier in Q[X], so sooner helps with onboarding"].

Either way, happy to answer anything.

[Your name]

---

## Scenario 2: Post-Proposal Follow-Up (4 Emails)

**Use this after:** You sent a formal proposal document.

### Email 1 — Proposal Delivery (Send: Immediately with proposal)

**Word count:** 50–70 words

**Body:**

Hi [First Name],

Attached is your proposal for [Business Name]'s AI receptionist.

Two things to read first: (1) "What the Receptionist Will Do for You" — that is the core, and (2) "Your Numbers" — that shows what the opportunity looks like for your business.

I'd love to walk through the investment section with you live — it is easier to discuss. How does [specific date/time] work?

[Your name]

---

### Email 2 — Walkthrough Offer (Send: 2 days after Email 1)

**Word count:** 60–80 words

**Body:**

Hi [First Name],

Have you had a chance to review the proposal?

I know decisions take time. If it would help, I can do a quick 15-minute walkthrough of the investment section and answer any questions about setup, timeline, or how it works.

Two times that could work: [specific time option 1] or [specific time option 2].

Let me know.

[Your name]

---

### Email 3 — Value-Add Insight (Send: 5 days after Email 2)

**Word count:** 70–90 words

**Body:**

Hi [First Name],

Saw this and thought of our conversation about [specific challenge they mentioned]: [link to a sourced article, data point, or industry resource].

It is [one sentence about why it is relevant to them].

Not pushing anything — just wanted to pass it along in case it is useful for your planning.

Let me know if you have questions about the proposal.

[Your name]

---

### Email 4 — Direct Check-In (Send: 5 days after Email 3)

**Word count:** 60–80 words

**Body:**

Hi [First Name],

I want to be respectful of your time. Where do things stand on your end?

Is there anyone else who needs to review the proposal? Or is there something in it that does not fit your situation? I am happy to adjust.

Give me a yes, no, or "let's talk" — whatever helps you move forward.

[Your name]

---

## Scenario 3: Ghost Recovery (2 Emails)

**Use this after:** The prospect stopped responding after prior engagement (demo, call, or earlier email).

### Email 1 — Pattern Interrupt (Send: 7 days after last unanswered email)

**Word count:** 40–60 words

**Body:**

Hi [First Name],

Quick question: Did I say something that turned you off, or is this just not the right time?

No hard feelings either way — I just want to know.

Hit reply or call [your phone].

[Your name]

---

### Email 2 — Honest Breakup (Send: 10 days after Email 1)

**Word count:** 50–70 words

**Body:**

Hi [First Name],

I have reached out a few times and haven't heard back. I totally understand — things get busy.

I do not want to be that person who fills your inbox. My door is open if this becomes relevant again.

Best of luck with [their business]. If things change, you know where to find me.

[Your name]

---

## Scenario 4: Nurture (Long-Term, Not Ready Now)

**Use this when:** The prospect is a good fit but not ready to buy now. Send one email per month, always with genuine value and no ask.

### Monthly Email Pattern (Send: Once per month on the same date)

**Word count:** 60–80 words

**Body template:**

Hi [First Name],

Saw [this industry article / this data point / this tool] and thought of you and [business name].

[One sentence: why it is relevant to what they do or the challenge they mentioned.]

Thought you'd find it interesting — no follow-up needed.

Talk soon.

[Your name]

**Month 1 — Industry Insight or Trend:** Share a sourced article or statistic about their industry or the problem they described. Always include the URL.

**Month 2 — Resource:** Share a free tool, template, or guide relevant to their business (e.g., a scheduling best-practices guide for a salon).

**Month 3 — Question-Based Check-In:** Genuine question about their business or goals based on what you know about them.

**Month 4 — Industry News:** Another sourced article or development in their space.

**Month 5 — Demo Reminder:** Light reminder about {{DEMO_PHONE}}: "Still here if you want to hear how the AI handles [specific thing they asked about]."

**Month 6 — Personal Note:** A genuine check-in referencing something specific about their business or goals.

---

## Phone & Voicemail Scripts

**Use these ONLY when:**
- The prospect asked you to call
- You are mid-conversation and they ask to talk by phone
- They are a warm/hot prospect who has engaged at least twice

**Never use automated calling or voicemail drops.**

### Voicemail Script 1 — Post-Demo Follow-Up (30 seconds)

```
Hi [First Name], this is [Your Name] from LaunchPad Local. I wanted to follow up on the receptionist demo you heard — specifically about [one thing they asked about or seemed interested in]. I have an idea on how we can make that work for your [business type]. I'll send you a quick email with details. Look for it from [your email]. Talk soon.
```

### Voicemail Script 2 — Proposal Follow-Up (30 seconds)

```
Hi [First Name], it is [Your Name] from LaunchPad Local. Just checking in on the proposal we sent over for [Business Name]. No pressure at all — I just wanted to see if you have questions or if there is anything in it that does not fit your situation. Call me back or I'll follow up by email. [Your phone]. Talk soon.
```

---

## SMS Templates (Warm/Hot Leads Only)

**Use ONLY if the prospect gave written consent** (e.g., through the website form). **Every text must include the opt-out line.**

### Template 1 — Demo Reminder

Hi [Name], it's [Your Name] from LaunchPad Local. Want to try the AI receptionist? Call {{DEMO_PHONE}} and ask it to handle a call like you would. Reply STOP to opt out.

### Template 2 — Proposal Check-In

Hi [Name], got your proposal? Questions on setup or cost? Call me or hit reply and I will walk you through it. Reply STOP to opt out.

### Template 3 — Quick Question

Hi [Name], quick question: How is your business handling [specific pain point they mentioned]? Would love to catch up. Reply STOP to opt out.

---

## Step 3: Email Format & Compliance

**Every non-reply email must include:**

1. **Mailing address**: {{MAILING_ADDRESS}}
2. **Opt-out line**: "Click here to unsubscribe" (a one-click link) or "Reply with STOP to opt out"
3. **One clear next step**: Call, reply, click, or try the demo. Not multiple asks.

**Email signature for all follow-ups:**

```
[Your name]
LaunchPad Local
{{CONTACT_PHONE}}
{{CONTACT_EMAIL}}

---

{{MAILING_ADDRESS}}

This email was sent because you engaged with LaunchPad Local. Click here to unsubscribe.
```

---

## Output Format

Write the complete sequence to `sales/[BUSINESS-SLUG]-FOLLOWUP.md` where `[BUSINESS-SLUG]` is a short identifier (e.g., `acme-plumbing-FOLLOWUP.md`).

```markdown
# Follow-Up Sequence: [Business Name]

Generated: [Date]
Scenario: [Selected Scenario]
Prospect Temperature: [Hot/Warm/Cold]

---

## Prospect Context

| Field | Details |
|-------|---------|
| Prospect | [Name] |
| Business | [Business Name] |
| Last Interaction | [Type] on [Date] |
| Key Discussion Points | [Bullet list] |
| Temperature | [Hot/Warm/Cold] |

---

## Selected Scenario: [Scenario Name]

### Email 1: [Title]
**Send:** [Timing]
**Subject:** [Subject line]

[Full email body]

---

### Email 2: [Title]
[Same format]

---

[Continue for all emails]

---

## Phone Scripts

### Voicemail — [Timing]
[Full script]

---

## SMS Templates (Consent-Based)

[Include only if prospect gave written consent]

---

## Best Practices Applied

- All emails under 120 words
- One clear next step per email
- Every fact is sourced or from prospect conversation
- No promises about outcomes
- Compliance headers in all non-reply emails
```

---

## Rules and Constraints

1. **Every email must add value.** "Just checking in" gets deleted. Only send if you have something new.
2. **One next step per email.** Do not ask them to call AND email AND try the demo. Pick one.
3. **Under 120 words.** Respect their time. Most emails should be 60–80 words.
4. **Phone and voicemail are manual only.** Only call prospects who asked for a call or are mid-conversation. Never cold call or leave unsolicited voicemails.
5. **SMS requires written consent.** Never text unless they checked a box or explicitly asked. Always include "Reply STOP to opt out."
6. **Reference specific details.** Use their business name, the challenge they mentioned, or something they said. No generic templates.
7. **No LinkedIn outreach.** No LinkedIn messages, no profile views, no post likes. Email and phone only.
8. **Sourced value-add only.** If you share an article, it must have a real URL you can cite. Do not invent statistics or benchmarks.
9. **Compliance.** Non-reply emails include {{MAILING_ADDRESS}} and an opt-out line. One-to-one replies to a prospect email do not need these.
10. **Honest tone.** Be direct. If you are following up because you want the sale, say so in a friendly way. Do not be sneaky.
