---
name: sales-objections
description: Handle the 12 most common objections when selling an inbound AI phone receptionist to local service businesses.
---

# Objection Handling Playbook: AI Phone Receptionist

This playbook gives you word-for-word responses for the 12 objections you'll hear most when selling an inbound AI phone receptionist to local businesses. Every response is ready to use in a call, email, or text.

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

## Invocation

```
/sales-objections <industry or objection>
```

Where `<industry or objection>` is the prospect's industry (e.g., "plumbing", "dental", "law firm") or a specific objection name.

---

## The 12 Most Common Objections

---

### Objection 1: "It's too expensive"

**What it really means:** They do not yet see how the value justifies the cost, or they need to confirm budget exists.

**Response (direct):**
"I understand. {{PRICE from config/offerings.yaml}} is real money. Here's what I'd ask you to consider though: if you're missing even five calls a week from service calls or appointment requests, that's a few hundred dollars in lost revenue or rescheduling overhead every month. The AI costs {{PRICE from config/offerings.yaml}}. So the math is whether it brings in or saves more than that per month in your situation. Want to call the demo and think it through?"

**If they push on price:**
"What if we looked at {{TRIAL_TERMS}} so you can see your real call volume and call types before deciding? Fair?" (Use only trial terms the owner has set. If there are none, offer the demo line instead.)

**What NOT to say:** Do not quote savings, ROI, or estimated recovered calls. That's their math to do, not ours.

---

### Objection 2: "Customers hate robots / want a real person"

**What it really means:** They fear the AI will damage their reputation or lose customers.

**Response (direct):**
"Two things here. First, the AI tells callers upfront that it's an AI and that calls are recorded. It's not pretending to be a person. Second, if a caller asks for a person or mentions an emergency, the AI transfers them to your number, and if you can't pick up it takes a message and flags it urgent. Call {{DEMO_PHONE}} and ask for a person yourself to hear how it handles that."

**If they worry about reviews:**
"Reviews come from how fast you respond and how well you solve their problem, not from whether a machine answered the phone. The AI gets their info accurate and gets it to you immediately. You still own the customer experience."

**What NOT to say:** Do not promise customer satisfaction or claim businesses see better reviews.

---

### Objection 3: "What if it gets something wrong?"

**What it really means:** They fear lost information, misdialed transfers, or confused FAQs.

**Response (direct):**
"It won't understand every call perfectly — that's real. But here's how we handle it: the AI transfers immediately if a caller asks for a person or reports an emergency. You also get a text and email summary of every single call, including a transcript. So if the AI misunderstood something, you'll see it in the summary, and you can follow up with the caller. The goal is not to make it perfect; it's to make sure nothing gets lost and you're not tied to your desk."

**If they ask for examples of what it won't handle:**
"It won't understand complex questions outside your FAQs. It won't know your staff member's name if you never told it. It won't handle conference calls or three-way conversations. Basically, anything unusual gets escalated to you."

**What NOT to say:** Do not promise zero errors or claim it's as good as a human.

---

### Objection 4: "Is recording calls legal in Florida?"

**What it really means:** They are genuinely concerned about compliance.

**Response (direct):**
"Yes. Florida is an all-party-consent state, which means everyone on the call needs to know it's being recorded. The AI announces at the start: 'This call may be recorded.' It says that on every call, before anything else. I'm not a lawyer, so if you want your attorney to review it, I'm happy to send the exact wording."

**If they ask about specific scenarios:**
"If a caller hangs up before hearing the disclosure, you're still protected because they called you and you answer with the disclosure. If they call and hang up immediately without listening, you can document that if needed."

**What NOT to say:** Do not invent details about call recording technology or make promises about legal defense.

---

### Objection 5: "We already have an answering service"

**What it really means:** They do not see why they should switch costs and change workflows.

**Response (direct):**
"Answering services answer calls and take messages — that's valuable. The difference here is speed and data. With an answering service, you get a voicemail or email hours later. With the AI, you get a text and email summary within seconds. Plus, if you want to automate appointment booking when you're available, the AI can do it. You're not waiting for a call back to a scheduler. That said, if your answering service is working perfectly, this might not be for you. Would you be open to a quick call with the demo so you can compare?"

**If they say cost is about the same:**
"Then the real question is: does the AI's speed and appointment booking help you or your staff spend less time on the phone? Call the demo first. See if it changes anything."

**What NOT to say:** Do not claim your service is cheaper or better than all answering services.

---

### Objection 6: "My receptionist handles it"

**What it really means:** They have staff and do not see why they would change or reduce headcount.

**Response (direct):**
"That makes sense. Here's what's real though: your receptionist is probably handling a lot of calls that are just FAQ questions, appointment requests, or voicemails. The AI handles those. Your receptionist gets back the hours they spend on the phone for higher-value work — managing actual customers, handling complex calls, or just not being slammed during busy season. We're not saying you fire anyone. We're saying your staff handles fewer routine calls."

**If they worry about job security:**
"We've never asked a client to fire staff. What we do see is that their receptionist doesn't quit because they're overloaded, or they can handle overflow during peak times without hiring temps."

**What NOT to say:** Do not promise they can reduce staff or cut payroll.

---

### Objection 7: "I don't get that many calls"

**What it really means:** They think the cost is not justified by their call volume.

**Response (direct):**
"How many do you get — ballpark?" [Wait for answer.] "OK, so even if it's just 10 a day, that's 50 a week. If half of those are after-hours or when you're busy, the AI handles them so they don't go to voicemail or get dropped. But here's the real thing: call the demo. If after you hear it you still think it's not worth it for your volume, I'll tell you honestly that you're probably right. Some businesses are too quiet for this to matter."

**If they say they mostly get calls at specific times:**
"Then the AI can be more aggressive during those times — pick up immediately, book appointments if you want. Off-hours, it can tell callers you'll call back in the morning. You're not paying it to sit idle."

**What NOT to say:** Do not claim low-volume businesses always benefit or need this product.

---

### Objection 8: "Send me info"

**What it really means:** Usually a polite way to end the conversation; occasionally genuine.

**Response (direct):**
"Happy to send materials over. But I want to be honest: a brochure PDF probably won't tell you what you actually need to know. What would actually help? Is it pricing, how it handles after-hours calls, or do you want to hear what an actual call sounds like? I can send something specific, or better yet, call {{DEMO_PHONE}} for 30 seconds right now and see for yourself."

**If they insist on email:**
"I'll send a summary over today. What's your email?" [Send it.] "I'll follow up Thursday. If you have questions by then, text me."

**What NOT to say:** Do not send a generic brochure and assume that's the end of it.

---

### Objection 9: "Need to think about it"

**What it really means:** They are not ready to commit or have an unspoken concern.

**Response (direct):**
"That's fair — this is a decision. Before you go though, what would actually move the needle for you? Is it the cost, how the AI handles emergencies, or something else? If I can clear that up now, you'll have one less thing to think about."

**If they still say "I'll call you back":**
"I'll reach out Monday. In the meantime, if you want to hear what the demo line sounds like, call {{DEMO_PHONE}} — it takes 30 seconds. Sometimes that's the fastest way to decide."

**What NOT to say:** Do not guilt them into a commitment or make false urgency.

---

### Objection 10: "Tried a phone tree / AI before"

**What it really means:** A previous AI or phone system was confusing, frustrating, or did not work. They are gun-shy.

**Response (direct):**
"What happened with the last one?" [Listen.] "OK, so [specific problem]. We're designed differently. That system probably tried to be too clever — lots of menu options, hard to transfer, no way to reach a person. This one is simple: caller says what they need, AI answers if it can, or it gets you. No menu tree, no confusing button pressing. But I get it — fool you once. Call the demo and see if this one feels different."

**If they say the AI was inaccurate:**
"That one probably didn't have good training. We spend time upfront making sure the AI only answers what you tell it to answer. It's not guessing."

**What NOT to say:** Do not bash their previous vendor by name or promise this one is perfect.

---

### Objection 11: "What about emergencies?"

**What it really means:** They need to know the AI will not interfere with urgent calls.

**Response (direct):**
"Emergencies are the one thing the AI absolutely passes to you. Caller says 'this is an emergency' or asks for a person, the AI stops and transfers you immediately. It also lets you define what an emergency looks like for your business — is it a police call, a medical issue, a break-in, or something specific to what you do? You tell us, we configure it, the AI handles it."

**If they worry about transfer delays:**
"The transfer is instant — they're not waiting on hold. You'll also get a note that it was an emergency so you know context."

**What NOT to say:** Do not promise zero false emergencies or that the AI is perfect at identifying them.

---

### Objection 12: "Not interested"

**What it really means:** Could be genuine disinterest, could be bad timing, could be that your pitch missed the mark.

**Response (direct):**
"Totally fair. One quick question before I go: is it that you've already solved the call-handling problem, or just that this doesn't feel like a priority right now?"

**If they say it's not a priority:**
"Got it. If call volume gets worse or you get tired of missed calls, reach out. I'll leave my info."

**If they say they have it solved:**
"Even better. If that changes or you get curious, call the demo line sometime — {{DEMO_PHONE}}. No strings."

**What NOT to say:** Do not continue to push after they say no. Respect the boundary.

---

## Quick Reference: When to Use What

- **Objection is about cost?** → Focus on what they're currently losing (missed calls, staff time). Offer the demo as proof they need it.
- **Objection is about fear (customers hate it, it might break)?** → Remind them the AI is transparent, callers can opt out, they get a full transcript either way.
- **Objection is about current solution (answering service, receptionist)?** → Acknowledge it works, then focus on speed and automation.
- **Objection is about interest level?** → Get them to call the demo. That is your best response tool.

---

## What NOT to Do (ever)

1. Do not invent stats, case studies, or promised outcomes.
2. Do not guess at competitor pricing or claim you are cheaper.
3. Do not promise zero errors, 100% accuracy, or "never miss a call."
4. Do not bash answering services or claim your AI is better than humans.
5. Do not make pricing or discount offers that are not approved.
6. Do not follow up more than once after they say no. Respect their boundary.

---

## The Golden Rule

The demo call at {{DEMO_PHONE}} is your strongest objection handler. Use it early and often. Watching someone experience the product live changes minds more than any script you can read.
