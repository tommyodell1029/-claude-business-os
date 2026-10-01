---
name: client-cancellation
description: Handle a LaunchPad Local client's cancellation email. Draft a respectful, concerned reply that asks why they're leaving, look for a real fix, and honor the cancellation if they still want it.
---

# Client Cancellation and Retention

Use this skill when a client emails to cancel (or says they want to cancel). Invoke it as `/client-cancellation <client slug or name>`, or use it when a cancellation email is found in the LaunchPad inbox through the Gmail connector.

## Policy (from `config/offerings.yaml` → `terms`)
- Month-to-month. Clients can cancel anytime by email.
- Cancellation stops future billing. Service continues until the end of the period already paid.
- All sales are final. No refunds on setup fees or monthly fees, including partial months.

## Non-negotiable rules
1. **Always honor the cancellation.** Never refuse, delay, ignore, or make cancelling harder. Never require a call, a form, or a reason before cancelling. Never threaten fees, penalties, or loss of data to keep them.
2. **Drafts only.** Create a Gmail draft for the owner to review and send. Never send on your own.
3. **Ask about the reason at most twice.** If they don't want to talk about it, or say no to the fix, confirm the cancellation in your next reply.
4. **Offer only real fixes.** Never offer a discount, free month, credit, refund, or price change unless the owner approves it first. Never promise features that are not built (check `available: true` in `config/offerings.yaml`). Never claim results.
5. **Tone.** Respectful, concerned, and curious. Plain, warm, human language. No guilt, no pressure, no sales clichés. Short (under 150 words).

## Step 1: First reply (acknowledge + ask why)
Read the client's email and their record (`clients/<slug>.yaml`, recent calls in Supabase `calls`). Then draft:

- Thank them by name and confirm the request was received and **will be honored**.
- Say plainly when service and billing stop (end of the period already paid).
- Ask one or two open, genuine questions to understand what went wrong. Examples:
  - "Was there something the receptionist did, or didn't do, that let you down?"
  - "Were calls being handled differently than you expected?"
  - "Is it more about cost, call volume, or how it fits your business right now?"
- Offer a quick call if they'd prefer to talk, but make clear it is optional.

**Template (adapt to the client's words):**
> Hi {first name},
>
> Thank you for letting me know, and for giving LaunchPad Local a try. I've received your request to cancel and I'll take care of it. Your service and billing will stop at the end of your current paid period on {date}.
>
> Before I close it out, I'd really like to understand what happened. Was there something about how calls were handled, or how it fit your business, that didn't work for you? Your honest answer helps me, and if it's something I can fix, I'd want to.
>
> Either way, the cancellation stands unless you tell me otherwise.
>
> {owner name}
> LaunchPad Local

## Step 2: If they explain the reason
Find the real pain point, then decide whether a genuine fix exists.

| What they say | Possible real fix (only if true for their account) |
|---|---|
| "It gave wrong or vague answers" | Update their FAQs and approved answers; review recent transcripts together |
| "Calls weren't transferred / I couldn't be reached" | Fix the handoff number or hours; test a transfer with them |
| "Customers didn't like it" | Adjust the greeting, voice, or speed; shorten the script |
| "It's too expensive" | Move them to a lower tier from `config/offerings.yaml` if their call volume fits. No custom discounts without owner approval. |
| "Not enough calls to justify it" | Lower tier, or an honest acknowledgement that it may not be the right fit right now |
| "Spanish-speaking callers" | Spanish/English add-on (available) |
| "We're closing / hired someone / changed plans" | No fix. Thank them and confirm the cancellation. |

If a fix makes sense, describe it in one or two sentences, offer to do it before their end date, and ask whether they'd like to try it. If not, or if they say no, go to Step 3.

## Step 3: Confirm the cancellation
> Hi {first name},
>
> Understood, and thank you for telling me. Your cancellation is confirmed. Service and billing stop on {date}, and you won't be charged again.
>
> {One honest sentence acknowledging their reason.} If anything changes down the road, I'd be glad to help again.
>
> Thank you for working with LaunchPad Local.
>
> {owner name}

## After the conversation (owner actions)
- Cancel the subscription in Stripe so it ends at the period end (no refund).
- Mark the client `status = 'ended'` in Supabase `clients` and note the reason (for the weekly report).
- Point their Twilio number away from the agent on the end date.
- Record the reason in `ops/cancellations.md` so patterns surface over time.
