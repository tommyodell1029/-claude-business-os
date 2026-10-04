# agents: the LaunchPad Local AI receptionist

One Pipecat template serves every client. Everything specific to a business comes from `clients/<slug>.yaml`.

**Pipeline:** Twilio media stream → Deepgram speech-to-text → emergency keyword watcher → Anthropic `small` model (from `config/models.yaml`) driven by Pipecat Flows → ElevenLabs or Cartesia text-to-speech → Twilio.

## Call flow (`flow.py`)

| Node | What happens | Leaves by |
|---|---|---|
| **greeting** | Speaks the disclosure word for word: *"Thanks for calling {business}, I'm their AI assistant. This call may be recorded."*, then the client's greeting. The disclosure is built in code and no config can remove it. | `set_intent` |
| **faq** | Answers only from the client's approved answers, hours, services and service area. A question the config doesn't answer (including any price) goes to `question_not_covered`, which speaks a fixed line: *"I'm sorry, I don't have that information. I can take a message for the team so they can follow up with you. Would you like me to do that?"* The question is added to the call summary. | `needs_followup` → collect · `questions_done` → end · `question_not_covered` → faq (after the fixed line) |
| **collect** | Name, callback number (validated as a US number), need, address or area, urgency, best time. Natural times like "tomorrow morning" are accepted as said, never pushed to an exact time. | `save_caller_details` |
| **request_time** | Only when `booking_method.type: request_time`. Takes a preferred time in the caller's words; the team confirms it, no availability promised. | `save_preferred_time` |
| **confirm** | Reads the details back, reading the phone number digit by digit and the time in the caller's words. | `correct_detail` · `details_confirmed` → end |
| **transfer** | "One moment. I'm connecting you now." then transfers to `handoff_number`. If nobody answers, takes a message and flags it **URGENT**. | — |
| **end** | Says goodbye and hangs up. The model never says its own goodbye; this node's fixed line is the only one. | — |

**Available at every node:** `transfer_to_human` (emergency, or the caller asks for a person) and `end_call` (abusive or spam callers).

**Deterministic backups that don't rely on the LLM:**
- `guards.ToolTurnFilter` (between the LLM and TTS): if the model streams a sentence and calls a function in the same reply, that sentence is dropped, because the next node always speaks. This stops the unprompted filler line and the double goodbye. Cost: TTS starts when each short reply ends rather than after its first sentence.
- Any `emergency_keywords` match, whole words only, in what the caller says forces a transfer (`guards.EmergencyWatcher`).
- A keyword in the caller's stated need forces the call to urgent.

## Safety and cost guards (`guards.py`)
- **Hard maximum call length:** `max_call_minutes`. The agent wraps up politely, then the call is force-cancelled 30 seconds later.
- **Silence:** after `silence_timeout_secs` of silence it asks "Are you still there?". The second timeout ends the call.
- **Spam and abuse:** handled by the `end_call` function.
- **Per-call cost estimate:** calculated from the per-minute rates in `config/voice.yaml`. Until real provider rates are entered there, the estimate is left empty (null), never guessed.
- **Inbound only:** there is no outbound calling code anywhere.

## After the call (`call_record.py`)
- Builds a record matching the Supabase `calls` table, including `disclosure_spoken` and `end_reason`.
- Until the notification handler exists (T5), the record is written to `data/calls/<CallSid>.json`. That folder is gitignored and the files are set to owner-only read and write (chmod 600).

## Adding a client
1. Copy `clients/demo.yaml` to `clients/<slug>.yaml` and fill it in from `/ops/client-intake.md` (T5).
2. Put phone numbers and emails in environment secrets as `${VAR}`, never directly in the YAML.
3. Validate it: `uv run python -c "from agents.client_config import load; load('<slug>', require_env=True)"`

## Testing

| Level | Command | Needs |
|---|---|---|
| Unit and scripted end-to-end calls, run through the real Pipecat pipeline and FlowManager | `uv run python -m unittest discover -s tests` | nothing |
| Live text call with the real `small` model (typed caller lines; reports response latency) | `uv run python -m agents.simulate demo "Hi, my water heater is leaking" "Ann, 904 555 0133" "yes"` | `ANTHROPIC_API_KEY` or `LP_ANTHROPIC_API_KEY` |
| Real phone call | T4: Twilio number → Pipecat Cloud | Twilio, Deepgram, ElevenLabs keys |

## Deploy (Pipecat Cloud, T4)
1. Secret set (values come from env; never typed into chat or git): `pipecat cloud secrets set lp-receptionist-secrets ANTHROPIC_API_KEY=... DEEPGRAM_API_KEY=... ELEVENLABS_API_KEY=... TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... DEMO_TWILIO_NUMBER=... DEMO_HANDOFF_NUMBER=... DEMO_OWNER_PHONE=... DEMO_OWNER_EMAIL=... TRANSFER_ACTION_URL=... --region us-east`
2. `pipecat cloud deploy` from the repo root (reads `pcc-deploy.toml`, builds `Dockerfile` with Pipecat Cloud Build; auth via `PIPECAT_TOKEN` + `PIPECAT_ORG`).
3. Twilio: point the number's "A call comes in" at the site webhook `https://launchpad-site-ten.vercel.app/api/twilio/inbound` (HTTP POST). It verifies Twilio's signature, gets a one-time session token from Pipecat `/start`, and returns the tokenized stream URL; `pcc-deploy.toml` has `websocket_auth = "token"`, so nothing else can start a session. Full order and rollback: `ops/twilio/CUTOVER.md`. The TwiML Bin (`ops/twilio/demo-inbound.twiml.xml`) is rollback only and works only under `websocket_auth = "none"`.
4. Run the 8 calls in `ops/twilio/T4_TEST_CALLS.md`.

For pipeline problems during phone tests, use Pipecat's Whisker debugger (T4).
