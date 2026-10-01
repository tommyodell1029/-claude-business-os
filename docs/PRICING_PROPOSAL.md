# Pricing Proposal (draft for owner approval)

**Status:** APPROVED by owner 2026-10-01, with these decisions (now in `config/offerings.yaml`):
- **First 5 clients (founding):** recommended tiers: Launch $297/mo, Growth $497/mo, Scale $997/mo; setup $497 / $497 / $997.
- **Founding offer:** setup fee is NOT waived. The month after purchase is free; monthly billing starts on the 1st of the second month after setup (setup Sept 1 → October free → first charge Nov 1). Implemented in `lp.billing.first_recurring_charge`.
- **Client 6 onward (standard):** Master Spec tiers: $497 / $797 / $1,497 per month; same setup fees and inclusions; no free month.
- **Add-ons:** sell everything marked "Yes" below now; the rest become sellable when built and tested.
- Terms: month-to-month, no trial, all sales final (no refunds), cancel anytime by email; cancellation emails get a retention reply (`client-cancellation` skill).
**Date:** 2026-10-01. Market figures come from public pricing pages and pricing round-ups (sources listed at the end). Treat them as ranges, not guarantees.

## 1. What a call minute costs us (estimate)

| Component | Rate (source) | Per call-minute |
|---|---|---|
| Twilio inbound, US local | $0.0085/min | $0.0085 |
| Deepgram streaming STT | ~$0.0077/min | $0.0077 |
| ElevenLabs Flash TTS | $0.05 per 1k characters; assumes the agent speaks ~450 characters per call-minute | ~$0.023 |
| Claude Haiku 4.5 | $1 input / $5 output per 1M tokens; assumes ~15k input + ~300 output tokens per call-minute, before caching | ~$0.017 |
| Pipecat Cloud agent-1x | $0.01/min active | $0.010 |
| **Total** | | **≈ $0.066/min, call it $0.07** |

Fixed costs: one Twilio local number is $1.15/month per client.

These are **estimates** built on stated assumptions. T4 measures real usage per call, and `config/voice.yaml` gets the confirmed rates.

| Client size (minutes/month) | Usage cost | With number |
|---|---|---|
| Light (300) | ~$21 | ~$22 |
| Medium (800) | ~$56 | ~$57 |
| Heavy (2,000) | ~$140 | ~$141 |

## 2. What the market charges

| Option | Typical price | Notes |
|---|---|---|
| DIY AI receptionists (Rosie, Goodcall, My AI Front Desk) | $49–$299/mo | Self-serve: the owner sets it up. Rosie: $49 / $149 (1,000 min) / $299 (2,000 min). Goodcall from $79. My AI Front Desk $99 for 200 min, then $0.25/min. |
| Human answering services (Ruby, Smith.ai) | ~$250–$2,100/mo | Ruby from ~$250 for 50 min. Smith.ai $300 for 30 calls up to $2,100 for 300 calls. |
| Done-for-you AI agencies | $500–$3,000 setup + ~$300–$800/mo per agent at the low end | Setup covers scripting, voice, phone setup, testing and go-live. |
| Small-business website (agency) | $2,500–$4,000 for a 5-page local service site; $35–$100/mo maintenance | Freelancers: $500–$5,000. |

**Where we fit:** done-for-you and local. We set it up, tune it and manage it. That puts us above DIY tools, which make owners do the work, and far below human answering services. The live demo line is our proof; we make no case-study claims.

## 3. Receptionist tiers (recommended)

Setup fee covers intake, script and FAQs, voice, number, testing and go-live in under an hour. Month-to-month. No trial. All sales final (no refunds). Cancel anytime by email (approved 2026-10-01).

| | **Launch** | **Growth** | **Scale** |
|---|---|---|---|
| Monthly | **$297** | **$497** | **$997** |
| Setup (one-time) | $497 | $497 | $997 |
| Included minutes | 300 | 800 | 2,000 |
| Overage | $0.25/min | $0.25/min | $0.20/min |
| 24/7 answering, FAQs, messages, text + email summaries | ✓ | ✓ | ✓ |
| Emergency / "talk to a person" transfer | ✓ | ✓ | ✓ |
| Appointment-time requests (team confirms) | — | ✓ | ✓ |
| Monthly call report + script tuning | — | ✓ | ✓ |
| Locations / numbers | 1 | 1 | up to 3 |
| Spanish/English receptionist | add-on | add-on | ✓ |
| Est. usage cost at included minutes | ~$22 | ~$57 | ~$145 |
| **Est. gross margin on usage** (before your time) | **~93%** | **~89%** | **~85%** |

**Alternative (premium), implied by the Master Spec's MRR example:** Launch $497, Growth $797, Scale $1,497 per month. This fits the done-for-you agency range. It is harder to close as a first sale with no case studies, so it may be better adopted after 3–5 clients.

**First-client lever (optional):** waive setup for the first 3 "founding" clients in exchange for permission to ask for a testimonial if they're happy. The client must actually agree, and the testimonial must be real.

## 4. Upsells and add-ons

| Add-on | Price (proposed) | Ready to sell? |
|---|---|---|
| **Website build** (5-page local service site, mobile-first, contact form, click-to-call, demo-quality performance) | $1,497 one-time | After the client-website phase (planned after T6) |
| Website hosting + maintenance | $49/mo | Same |
| **Receptionist + website bundle** | Website at $997 when bought with Growth or Scale | Same |
| Google Business Profile setup / cleanup | $199 one-time | Yes (manual service) |
| Spanish/English receptionist | +$99/mo (included in Scale) | Needs a bilingual config + test (small build) |
| Extra number / location | +$99/mo each | Yes (one client YAML per number) |
| Monthly call report + tuning (Launch tier) | +$49/mo | After the weekly audit job (T8) |
| Calendar booking integration (books directly into their calendar) | $199 setup + $49/mo | **Not built.** Needs a calendar integration phase. |
| Website chat widget (same approved FAQs) | +$79/mo | **Not built.** |
| Missed-call text-back | +$49/mo plus carrier registration pass-through | **Not built.** Needs A2P 10DLC approval and caller consent (decision C2: after the first client). |

Rule: never sell an add-on as available before it is built and tested. "Coming soon" with no date is acceptable on proposals only if the owner approves that wording.

## 5. What the owner needs to decide
1. Tiers: the **recommended** prices ($297 / $497 / $997 plus setup), the **premium** prices ($497 / $797 / $1,497), or the owner's own numbers.
2. Setup fee amounts, and whether to waive setup for founding clients.
3. ~~Trial and cancellation terms~~ Decided: no trial, all sales final, cancel anytime by email.
4. Which add-ons go on the website now. Recommendation: only the ones marked "Yes".

Once approved, Claude updates `config/offerings.yaml`, the `/sales-proposal` skill inputs, and the site's pricing section, and creates matching Stripe Payment Links (owner clicks to create them).

## Sources
- AI receptionist prices: [Vellum](https://www.vellum.ai/blog/best-ai-receptionist-for-small-business), [Stork](https://www.stork.ai/blog/ai-receptionist-pricing-2026), [Voksha](https://voksha.com/guide/best-ai-receptionists-2026/), [Rain Voice AI](https://rainvoiceai.com/blog/ai-receptionist-cost)
- Smith.ai / Ruby: [Loman](https://loman.ai/blog/smith-ai-pricing), [Aira](https://www.getaira.io/blog/virtual-receptionist-pricing), [NextPhone](https://www.getnextphone.com/blog/smithai-alternative)
- Agency setup and retainer ranges: [Ciela](https://ciela.ai/blogs/how-much-to-charge-for-ai-voice-agent), [Seldon Frame](https://www.seldonframe.com/guides/how-to-price-an-ai-receptionist-service), [Callsy](https://www.callsy.ai/insights/ai-voice-agent-cost-2026)
- Website costs: [WebFX](https://www.webfx.com/blog/web-design/how-much-does-it-cost-to-build-a-website-for-a-small-business/), [WebFX maintenance](https://www.webfx.com/web-development/pricing/website-maintenance/), [JEG Design](https://www.jegdesign.com/small-business-website-design-cost/)
- Twilio: [Quiq](https://quiq.com/blog/twilio-voice-pricing/), [IDT Express](https://www.idtexpress.com/blog/twilio-pricing-explained-how-to-reduce-voice-costs/)
- Deepgram: [Cekura](https://www.cekura.ai/blogs/deepgram-pricing)
- ElevenLabs: [ElevenLabs API pricing](https://elevenlabs.io/pricing/api), [Puter](https://developer.puter.com/tutorials/elevenlabs-api-pricing/)
- Claude Haiku 4.5: [Finout](https://www.finout.io/blog/anthropic-api-pricing), [OpenRouter](https://openrouter.ai/anthropic/claude-haiku-4.5)
- Pipecat Cloud: [Daily pricing](https://www.daily.co/pricing/pipecat-cloud/)
