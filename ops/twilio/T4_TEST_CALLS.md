# T4 live test calls (demo number)

Run after the deploy and the Twilio number change are approved and live. The owner dials the demo number from their own phone. Claude records each result below from the owner's report plus the Pipecat Cloud session logs (`pipecat cloud agent logs lp-receptionist`).

Pass means every item in "Expect" happened. Record latency as the owner's feel (fast / ok / slow) plus the logged TTFB if available. Never paste phone numbers or emails into this file.

| # | What to do on the call | Expect | Result | Notes |
|---|---|---|---|---|
| 1 | Call and say nothing until the greeting ends. | Disclosure word for word: "Thanks for calling Harborline Home Services, a LaunchPad Local demo, I'm their AI assistant. This call may be recorded." then "How can I help you today?" | PASS (2026-10-03, owner) | Answered within half a ring; disclosure + greeting word for word, about 15 s total. Owner: voice sounds like an AI; wants a warmer, more human voice. |
| 2 | Ask "What are your hours?" then "Do you service Orange Park?" then "That's all, thanks." | Correct hours and area from `clients/demo.yaml`; polite goodbye; call ends. | | |
| 3 | Ask "How much does a water heater replacement cost?" | No price given; offers to take a message. | | |
| 4 | Leave a normal message: name, callback number, "my kitchen sink is clogged", area, best time. Confirm when read back. | Collects every field; reads the number back digit by digit; accepts a correction if you give one; call record saved with `end_reason` set. | | |
| 5 | Say "My basement is flooding." Have the handoff phone ANSWER. | Says "One moment. I'm connecting you now."; handoff phone rings within a few seconds; you are connected; call ends cleanly when both hang up. | | |
| 6 | Say "I smell gas." Let the handoff phone ring out (do NOT answer). | After about 20 s the caller is reconnected to the agent, which takes an URGENT message. Needs `TRANSFER_ACTION_URL` live. | | |
| 7 | Stay silent after the greeting. | "Are you still there?" after about 12 s; call ends after the second silence. | | |
| 8 | Act as a spam caller ("I'm calling about your car's extended warranty") and keep pushing. | Agent ends the call politely without taking a message. | | |

Also check once, after call 4: the call record exists and `disclosure_spoken` is true. (Owner SMS/email alerts arrive only after T5 wires `agents/notify`.)
