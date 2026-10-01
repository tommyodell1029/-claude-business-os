---
name: sales-competitors
description: Research competitor categories (answering services, voicemail, AI vendors, etc.) or analyze a specific prospect's current solution, and build positioning strategies for LaunchPad Local.
---

# Competitive Intelligence: LaunchPad Local

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
/sales-competitors [competitor name | url | "local market"]
```

Where:
- `[competitor name]`: Analyze a specific competitor (e.g., "answering services," "Ruby receptionist," "AI Call Handler")
- `[url]`: Prospect's website to detect what solution they currently use
- `"local market"`: High-level competitive landscape in Jacksonville metro for owner-operated service businesses

---

## Research Plan

For `/sales-competitors [competitor category]`, research the competitor category and build positioning. For `/sales-competitors [url]`, detect the prospect's current solution from their website and build battle cards. For `/sales-competitors "local market"`, provide a landscape of all major competitor categories in Jacksonville metro.

### Competitor Categories for Local Service Businesses

1. **Traditional answering services** (human operators): for example AnswerConnect or Ruby (verify each vendor's category before listing it)
2. **Voicemail and IVR**: PBX systems with voicemail, Google Voice, built-in phone system voicemail
3. **Virtual receptionist platforms**: for example LiveAnswer (verify before listing)
4. **AI-powered phone systems**: Retell AI, Bland AI, Synthesia Call, Google Call Screen, other AI vendors
5. **No solution / DIY**: Owner or office manager answering directly; no backup plan

### Detection Method (For Prospect URL Analysis)

Use WebFetch to analyze the prospect website for:
- **Phone system badges**: AnswerConnect, Ruby, or other vendors' badges in footer
- **Answering service mentions**: "Calls answered by our professional team" or "24/7 answering service"
- **AI/automation signals**: "Our intelligent system answers..." or partner logos
- **Review site signals**: Google Business Profile showing response times, "Can't reach them" reviews
- **Job posts mentioning tools**: Searched via WebSearch for "[business name] careers"

Record confidence level (High: explicit badge; Medium: mentioned in text; Low: inferred from industry standard).

---

## Competitor Category Deep-Dives

For each category, provide:

### [Category Name]

**What it is:** [Brief description]

**Market players:** [List 3–5 vendors with public URLs where available]

**Typical pricing:** {{PRICE from config/offerings.yaml}} — do not estimate without public source

**Strengths:**
- [Strength 1] — [Source URL or observation]
- [Strength 2]
- [Strength 3]

**Weaknesses:**
- [Weakness 1] — [Source: URL or field evidence]
- [Weakness 2]
- [Weakness 3]

**Switching cost:** [Low/Medium/High and why]

**LaunchPad Local positioning:** [How to position against this category. One sentence.]

**Objections if prospect uses this:** [How to respond when prospect says "We already use [competitor]"]

---

## Output Format

Write to `sales/COMPETITIVE-INTEL.md` at repo root.

**For category analysis** (`/sales-competitors [category]`):

```markdown
# Competitive Landscape: [Category Name]

Generated: [date]

## Market Overview
[What this category solves, who competes here, market maturity]

## Competitors

### [Vendor 1 Name]
Website: [URL]
Strengths: [3 bullet points with citations]
Weaknesses: [3 bullet points with citations]
Pricing: {{PRICE from config/offerings.yaml}} OR "See [URL]" if public
Switching cost: [Low/Med/High]

### [Vendor 2 Name]
...

## LaunchPad Local Advantages
[2-3 clear advantages vs. this category, with proof]

## Positioning Statements
- When prospect asks about [Vendor 1]: "[Response that acknowledges strength, then differentiate]"
- When prospect asks about [Vendor 2]: "[Response]"
...

## Key Questions to Ask Prospects Using This Category
[3–5 questions that expose gaps without attacking]

## Switch Triggers from This Category
[When prospects leave this category, why? What situations favor us?]
```

**For prospect analysis** (`/sales-competitors [url]`):

```markdown
# Competitive Analysis: [Prospect Business Name]

Generated: [date]
Website: [URL]

## Current Solution Detected
[Solution name] — Confidence: [High/Medium/Low]
Evidence: [Where detected on website]

## Competitor Profile
[Name of solution vendor]
- What it does: [Description]
- Their strengths: [3 strengths with source URLs]
- Their weaknesses: [3 weaknesses with source URLs]
- Switching cost for this prospect: [Assessment]

## LaunchPad Local Positioning
[One-sentence positioning statement]

## Talking Points When They Mention Their Current Solution
1. [Acknowledge strength]: "I know [vendor] has [strength]. And they're good at [use case]."
2. [Find gap]: "What I'm curious about — do they [question that exposes gap]?"
3. [Reframe]: "That's actually where we differ. We [LaunchPad differentiator]."

## Switch Trigger
[What event or problem might make them re-evaluate?]
```

---

## Rules and Constraints

1. **Cite every claim.** If not from a public source, mark as "Reported" or "Unverified." Never fabricate.
2. **Competitor strengths first.** If you don't acknowledge what a competitor does well, you lose credibility.
3. **Focus on LaunchPad real capabilities only:** Answers 24/7, discloses AI + recording, answers only from approved info, transfers emergencies or "person" requests, sends owner text + email summary. No made-up features.
4. **Local-specific focus.** Don't compare against enterprise features (sophisticated workflows, multi-user teams, API integrations). Competitors in this space don't have those either, and our buyers don't need them.
5. **No pricing estimates.** {{PRICE from config/offerings.yaml}} for us always. For competitors, cite public sources or write "Not public."
6. **Keep it brief.** 150–250 lines per output. Concise battle cards win deals faster than long docs.
7. **All output to `sales/COMPETITIVE-INTEL.md`.**
