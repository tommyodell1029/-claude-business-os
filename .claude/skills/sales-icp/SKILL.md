---
name: sales-icp
description: Build an Ideal Customer Profile (ICP) for a target industry among LaunchPad Local's service business verticals, or analyze all industries at once.
---

# Ideal Customer Profile: LaunchPad Local

## LaunchPad Local context (read first)
- **Seller:** LaunchPad Local, an AI receptionist agency in Jacksonville, FL (launchpadlocal.org).
- **Product:** an inbound AI phone receptionist. It answers a local business's calls 24/7 and discloses that it is an AI and that the call may be recorded. It answers FAQs only from information the business has approved, collects the caller's details, books appointments where booking is enabled, transfers emergencies or callers who ask for a person to the owner, and sends the owner a text and email summary after every call.
- **Buyers:** owner-operated local businesses in Jacksonville, Orange Park, St. Augustine, Fernandina Beach and Ponte Vedra: plumbing, HVAC, roofing, electrical, law firms, med spas, dental, chiropractic, real estate and insurance. The decision maker is usually the owner or office manager. There is no buying committee.
- **Live demo:** prospects can call the AI themselves at {{DEMO_PHONE}}.

## Guardrails (never break these)
1. **No invented facts.** Use only what the user provides, what the prospect's own website or public listings say, or sourced web research, and cite the URL. If something is unknown, write "Unknown", or ask the user.
2. **Prices come only from `config/offerings.yaml`.** Quote the founding price while `founding_clients_signed` is below 5, otherwise the standard price. Founding offer: setup fee paid in full, the next month free, monthly billing starts the 1st of the second month after setup. Only offer add-ons marked `available: true`. Never invent a price, discount, or term; trial and cancellation terms are still `{{TRIAL_TERMS}}` / `{{CANCELLATION_TERMS}}`. Never estimate a competitor's price unless a cited public source states it.
3. **No fabricated proof.** Never write or suggest case studies, testimonials, client logos, "businesses like yours saw X%" claims, benchmarks or ROI figures unless the user supplies them. LaunchPad Local has no published case studies. Offer the live demo number as the proof instead.
4. **ROI is the prospect's own math.** Any ROI section uses inputs the prospect gave (for example, missed calls per week and average job value). It must show the formula and label every figure as the prospect's estimate.
5. **Never guess email addresses** or infer email patterns. Use only an address the person published or gave us.
6. **Channels.** Email may go to people who have engaged with us or who came through a compliant cold-email sequence. Phone calls and voicemails are made manually by the owner, only to people who asked for a call or are mid-conversation. Texts go only to people who gave written consent (for example, through the website form's consent checkbox). No LinkedIn automation. No bulk messaging.
7. **Promises.** Never promise results, uptime, revenue or "never miss a call". Describe what the product does, not outcomes.
8. **Compliance.** Any email that is not a one-to-one reply includes {{MAILING_ADDRESS}} and an opt-out line. Florida is an all-party-consent state, so the AI always discloses recording. Mention this when a prospect asks about legality.
9. **Output files** go in `sales/` at the repo root (create it if missing) and never contain API keys or passwords.

---

## Purpose

You are building an Ideal Customer Profile for LaunchPad Local's inbound AI phone receptionist, targeted at local owner-operated service and professional businesses. Your job is to produce a profile that directly drives the lead-gen agent's targeting logic and arms the owner with decision criteria for prospect prioritization.

The ICP you produce must be grounded in observable market signals that the lead-gen agent detects: no online booking, no chat widget, "call us" as the main CTA, calls received during business hours only, review count and content suggesting missed-call frustration.

Focus on the decision maker (usually owner or office manager), the genuine pain points driving receptionist hiring decisions in this market, and the disqualifiers that save the owner's time.

---

## Instructions

When the user invokes `/sales-icp [industry]` or `/sales-icp all`, follow this process:

### Step 1: Select Target Industry or All Industries

If the user specifies an industry (e.g., `/sales-icp plumbing` or `/sales-icp dental`), build the ICP for that vertical. If the user specifies `/sales-icp all`, generate profiles for all target verticals: plumbing, HVAC, roofing, electrical, law, medical/cosmetic, dental, chiropractic, real estate, and insurance.

For each industry, follow the ICP framework below. Do not ask clarifying questions — LaunchPad Local's product and geography are fixed. Focus on the industry-specific decision drivers, pain points, and need signals.

### Step 2: Build the ICP Framework

Analyze the business description across all 6 ICP dimensions. For each dimension, provide specific, actionable criteria -- not generic advice. Use concrete numbers, named tools, specific job titles, and real industry examples.

#### Dimension 1: Firmographic Criteria

For local service businesses in LaunchPad Local's geography, define these characteristics as hypotheses to validate:

- **Business Type:** Owner-operated (sole proprietor or small partnership), not franchise corporate locations or in-house call centers.
- **Headcount:** 1–50 full-time equivalent employees. Larger businesses often have dedicated receptionists or call centers; smaller ones answer their own phones and feel the pain acutely.
- **Service Categories:** The 10 target verticals: plumbing, HVAC, roofing, electrical, law firms, medical/cosmetic services, dental, chiropractic, real estate, insurance. Hypothesis: these businesses receive enough calls to need 24/7 coverage but lack the budget for a full-time receptionist.
- **Geography:** Jacksonville, Orange Park, St. Augustine, Fernandina Beach, Ponte Vedra. Why: LaunchPad Local is Florida-based; Florida's all-party-consent recording law is a selling point. Expanding beyond this area requires new legal validation.
- **Revenue:** Unknown for most prospects (private businesses). Observable proxy: whether they have a website, Google Business Profile, and can afford to pay 1099 contractors.
- **Booking Behavior:** Currently take inbound calls only during business hours. Close evenings and weekends, or have an answering machine. This is the key pain signal.

| Firmographic | Ideal Fit | Disqualifier |
|---|---|---|
| Headcount | 1–50 employees | Large enough to have an in-house call center or front-desk team |
| Service type | Appointment-based or job-booking service | Retail, fast-food, or no-booking-needed businesses |
| Phone volume | Enough calls that some go unanswered (hypothesis; confirm in discovery) | Very few calls, or volume large enough for an in-house call team |
| Location | Jacksonville metro area counties | Outside service area; national franchises |
| Ownership | Owner-operated, single location | Corporate multi-location, heavily franchised |

#### Dimension 2: Observable Signals for Unmet Phone Need

For local service businesses, technographic data is sparse. Instead, detect unmet phone-answering needs:

- **Website signals:** Has a website but no booking widget. "Call us" is the primary CTA. No chatbot. Simple Wix, Squarespace, or WordPress site (not enterprise).
- **Google Business Profile:** Exists and shows call phone number prominently. Reviews mention "couldn't reach them" or "always busy" or "terrible hold times."
- **Answering infrastructure:** No virtual receptionist mentioned on website. No integrations with answering services (AnswerConnect, Ruby, etc. are not detected). Phone lines ring directly or go to voicemail.
- **Call handling today:** Owner or office manager answers calls. No dedicated receptionist (small payroll). After hours: voicemail or no answer.
- **Digital maturity:** Basic online presence. Email and phone are primary customer contact methods. Not using Slack, Teams, or internal comms tools (low organizational complexity = easier to onboard).

#### Dimension 3: Behavioral and Decision-Making Signals

For local service business owners, behavioral patterns differ sharply from enterprise:

- **Decision triggers:** Business growth (hired new technicians, expanded service area); staff turnover (lost a front-desk person); negative Google reviews mentioning missed calls; losing customers due to no-answer frustration.
- **Buying style:** Owner makes the decision alone or with office manager (if present). No formal procurement. Decisions made quickly (days to weeks, not quarters). Prefers live demo over documentation. Skeptical of automation but desperate for the problem to stop.
- **Where they research:** Google search for "missed calls solutions," "voicemail vs. receptionist," "AI phone answering." Peer recommendations (other tradespeople). Local Facebook groups. Not LinkedIn, Gartner, or analyst reports.
- **How to engage them:** Phone call or text (respectful of their time). Personal demo call using {{DEMO_PHONE}}. Quick ROI: "You've lost how many customers this month due to missed calls?"
- **Pain trigger windows:** After a missed-call incident. During staff turnover. Just after receiving a bad review. These are high-intent moments for outreach.

#### Dimension 4: Pain Point Map

Rank the top pain points driving receptionist hiring decisions. These are hypotheses: validate against prospect interviews.

| Pain Point | Severity | How It Shows | Business Impact | Our Solution |
|---|---|---|---|---|
| **Missed calls = lost customers** | Critical | The owner says calls go unanswered while they are on a job. Reviews say "couldn't get through." | Lost revenue and negative word-of-mouth. Quantify only with the owner's own numbers: missed calls per week × their average job value. | AI answers 24/7, captures caller details, books appointments where booking is enabled, and sends the owner a text and email summary. |
| **Owner/office mgr overwhelmed** | Critical | Answering phones all day = no time for operations, sales, follow-up, quality. Stress and burnout. | Diminishing returns: growth stalls because founder is chained to phone. | Frees up 10–15 hours/week for higher-value work. |
| **After-hours calls get nothing** | High | Customer calls at 7 PM, gets voicemail, calls competitor who has answering service. | Lost revenue; competitors gain market share. Particularly painful in emergency services (plumbing, HVAC). | AI takes call anytime. Caller feels served. Owner is notified. Can callback if urgent (emergency transfer option). |
| **No-callback liability** | High | Owner meant to follow up but forgot. Customer contacted competitor. Relationship lost. | Revenue churn; reputation damage. | AI logs every call + sends summary. Owner can't miss a prospect. |
| **Hiring/retaining a receptionist** | High | Owner is weighing whether to hire front-desk help. Ask what they would expect to pay; do not state a salary figure unless you cite a source. | Highest fixed cost alternative. Unpredictable availability. | One-time setup + recurring subscription at {{PRICE from config/offerings.yaml}}. No payroll tax, benefits, or turnover. |

#### Dimension 5: Budget and Decision Criteria

For owner-operated local businesses:

- **Revenue proxy:** Unknown from public data, but observable: have a website (someone hired to build it), can run Google Ads (allocate marketing budget), can afford a 1099 contractor. Do not estimate revenue figures.
- **Price point tolerance:** Willing to pay {{PRICE from config/offerings.yaml}} per month if ROI is clear. Decision: "This is cheaper than hiring someone full-time OR losing a customer." Not price-shopping; decision is binary (buy or keep the status quo).
- **Budget cycle:** No formal budget cycle. Decision happens when pain becomes acute: after missing a big call, after staff turnover, after reading a bad review. Buying happens in days to weeks.
- **ROI they understand:** The owner's own math: [their calls per day] × [share they miss] × [their average job value], compared with {{PRICE from config/offerings.yaml}}. Use only numbers they give you. Owner-operators think in concrete terms, not percentages.
- **Budget authority:** Owner or office manager (if present). No committee. No approval from above.
- **Budget flag signals:** Hiring new staff, expansion, growth in Google reviews/rating, recent equipment investment (van graphics, new tools). Any signal of business growth = likely has budget.

#### Dimension 6: Outreach and Engagement Strategy

How LaunchPad Local should reach and close with local service businesses:

- **Contact methods ranked by effectiveness:** (1) Compliant cold email from the lead-gen sequence inviting them to call the live demo at {{DEMO_PHONE}}; (2) a phone call or text only once they have asked for one or given written consent; (3) Not used: cold calls, cold texts, LinkedIn DMs, bulk campaigns.
- **Initial hook:** "Hi, I saw you're [industry] in [town]. You're probably getting calls after hours but no one's picking up. You can call our AI receptionist at {{DEMO_PHONE}} — it answers like a real person. Then I'll show you how it integrates with your number." (Live proof, not pitch.)
- **Trust signals:** Live demo (they call and hear it work). Local founder (Jacksonville-based). Florida recording law compliance mentioned early. A real client testimonial only once one exists and that client has given written permission to use it.
- **Buying timeline:** Tight. Trigger event → first call (same day or next) → demo call → questions answered → decision made within 3–5 days. No long sales cycle.
- **Disqualification:** If owner says "We're happy with our answering service" (switching cost is high) or "We're expanding to a bigger space and hiring a full receptionist" (commoditizing the solution), move on.
- **Objections to expect:** "I don't trust AI." (Live demo. Show it takes messages and books appointments.) "What if it messes up and transfers a customer wrong?" (Owner has override; emergency calls go to them.) "Your price vs. hiring someone." (Do math on their missed calls.)

### Step 3: Disqualifiers

Save time by identifying prospects to skip:

- **Too large:** >100 employees or has dedicated call center. Already has infrastructure we can't undercut. Corporate decision-making = long sales cycle.
- **Wrong industry:** Retail, restaurants, no-booking businesses. No inbound call need, or inbound volume too low to justify solution.
- **Already locked in:** "We use [major answering service] and love it." Switching cost is high. Mention solution for future consideration but deprioritize.
- **Expanding payroll:** "We're hiring a full-time receptionist." Our solution is now a feature request, not a business problem. May return post-hire if that fails.
- **Multi-location corporate:** Franchises answering to corporate. Decision-making is centralized. Budget holder not accessible.
- **No detectable pain signal:** Reviews don't mention call-handling issues. Website doesn't say "call us." No triggering event. Too early; nurture and revisit.

### Step 4: Scoring Hints

Quick 60-second qualification checklist for the owner:

| Signal | Presence = Good Fit | Absence = Lower Priority |
|---|---|---|
| In target industry (plumbing, HVAC, roofing, electrical, law, medical, dental, chiropractic, real estate, insurance)? | Yes → 1 point | No → 0 |
| In service area (Jacksonville metro)? | Yes → 1 point | No → 0 |
| 1–50 headcount (owner-operated, small office)? | Yes → 1 point | No → 0 |
| Google reviews mention "couldn't reach," "missed calls," or "no answer"? | Yes → 1 point | No → 0 |
| Website shows "call us" as main CTA; no booking widget? | Yes → 1 point | No → 0 |

**Scoring:** 5 points = A-grade prospect (call today). 3–4 points = B-grade (worth a call). 1–2 points = C-grade (nurture). 0 points = D-grade (skip).

### Step 5: Decision Maker Profile

In LaunchPad Local's ICP, there is usually one decision maker:

- **Owner/Operator** (Age 35–65): Started the business, wears multiple hats. Frustrated by phone interruptions. Wants a simple solution that "just works" without involvement. Skeptical of new tech. Needs live demo, not whitepaper. Convinced by: cost savings (fewer missed calls) and time (back to running the business). Closes in 3–5 days once convinced.
- **Office Manager** (Age 25–50, if present): Answers phones today. Burned out. Advocates hard for a solution. Wants to reduce phone volume so they can do other work. Easy sell. May persuade owner if they trust this person.

### Step 6: Prospecting Sources for LaunchPad Local

Where to find prospects matching the ICP:

- **Google Places API (via the lead-gen agent in `leadgen/`):** Text Search for "[industry] [town name]". Never scrape or export from Google Maps pages. The agent stores name, phone, address, rating, review count and hours, and detects pain signals.
- **Chamber of Commerce directories:** Jacksonville Chamber, local county business directories. Often list all businesses by industry.
- **Review sites:** Google Reviews, Yelp, Facebook. Filter by 50–500 reviews (indicator of active business) and scan for "couldn't reach," "no answer," "closed" complaints.
- **Job boards:** Indeed, Facebook Jobs, Craigslist. Search "[town] receptionist" or "[town] office assistant." Hiring = growth signal + future opening for our solution.
- **Industry associations:** Florida Plumber Association, HVAC contractors associations, dental board. Often publish membership directories.
- **Yellow Pages / Local directories:** Dex, SuperPages. Outdated but comprehensive for small businesses in service categories.
- **Social signals:** Facebook business pages for target industries. Local groups (Jacksonville Builders, etc.). Look for owners asking "how do you handle voicemail" or "we need a better phone system."
- **Lead-gen from internal agent:** If operational, `leadgen/config.yaml` already prioritizes high-signal prospects from these sources.

### Step 7: Competitive Landscape

LaunchPad Local competes against answering services, voicemail, virtual receptionist platforms, and other AI vendors. See `/sales-competitors` skill for detailed analysis. Key positioning: "Local to Florida, answers only from your approved info, transfers emergencies and requests for person to you immediately, gives you a text and email summary."

---

## Output Format

Write the ICP to `sales/IDEAL-CUSTOMER-PROFILE.md` at the repo root. Create the `sales/` directory if missing.

For `/sales-icp [industry]`, produce an ICP for that single industry. For `/sales-icp all`, produce one profile per target industry.

**Structure per industry:**

```markdown
# ICP: [Industry Name] (LaunchPad Local)

Generated: [date]

## Overview
[2-3 sentences: who this business is, why they need 24/7 call answering, decision maker]

## Firmographic Profile
[Table: business size, location, service area, ownership structure]

## Pain Points (Ranked by Urgency)
[Table: missed calls revenue loss, owner burnout, after-hours gaps, no-callback risk]

## Observable Signals
[How to spot them: Google reviews mentioning missed calls, no chat widget, "call us" CTA, answering service ad absence]

## Decision Maker
[Title, daily frustrations, what closes them, timeline]

## Budget and ROI
[{{PRICE from config/offerings.yaml}}, compared only against costs the owner states]

## Likely Objections and Rebuttals
[3–5 common objections and how to address with live demo]

## Disqualifiers
[Red flags that indicate this prospect is not a fit]

## Prospecting Tactics for [Industry]
[Where to find them, review signals, ideal contact method]
```

No personas, no feature tables, no competitive context needed here — those are embedded in the guardrails and `/sales-competitors` skill.

---

## Quality Standards

- All claims must be verifiable or hypothetical. Hypothesis labels: "We believe…", "Our hypothesis…"
- Pain points reflect owner frustration, not sales pitch.
- No ROI claims without the prospect's own numbers.
- Disqualifiers are saved time, not judgment.
- Prospecting sources are real URLs or search methods.
- Keep it concise: 150–250 lines per industry.

---

## Rules

1. Do not ask clarifying questions. LaunchPad Local's product and market are fixed.
2. Do not produce generic advice. Every line targets this industry specifically.
3. All output goes to `sales/IDEAL-CUSTOMER-PROFILE.md`.
4. After writing, confirm the file path and line count to the user.
