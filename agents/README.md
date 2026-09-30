# agents: the LaunchPad Local AI receptionist

One Pipecat template serves every client. Everything specific to a business comes from `clients/<slug>.yaml`.

**Pipeline:** Twilio media stream → Deepgram speech-to-text → emergency keyword watcher → Anthropic `small` model (from `config/models.yaml`) driven by Pipecat Flows → ElevenLabs or Cartesia text-to-speech → Twilio.

## Call flow (`flow.py`)

| Node | What happens | Leaves by |
|---|---|---|
| **greeting** | Speaks the disclosure word for word: *"Thanks for calling {business}, I'm their AI assistant. This call may be recorded."*, then the client's greeting. The disclosure is built in code and no config can remove it. | `set_intent` |
| **faq** | Answers only from the client's approved answers, hours, services and service area. If unsure, says so and offers to take a message. | `needs_followup` → collect · `questions_done` → end |
| **collect** | Name, callback number (validated as a US number), need, address or area, urgency, best time. | `save_caller_details` |
| **request_time** | Only when `booking_method.type: request_time`. Takes a preferred time; the team confirms it. | `save_preferred_time` |
| **confirm** | Reads the details back, reading the phone number digit by digit. | `correct_detail` · `details_confirmed` → end |
| **transfer** | "One moment. I'm connecting you now." then transfers to `handoff_number`. If nobody answers, takes a message and flags it **URGENT**. | — |
| **end** | Says goodbye and hangs up. | — |

**Available at every node:** `transfer_to_human` (emergency, or the caller asks for a person) and `end_call` (abusive or spam callers).

**Deterministic backups that don't rely on the LLM:**
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
3. Twilio: create a TwiML Bin from `ops/twilio/demo-inbound.twiml.xml`, then point the demo number's "A call comes in" at it.
4. Run the 8 calls in `ops/twilio/T4_TEST_CALLS.md`.

For pipeline problems during phone tests, use Pipecat's Whisker debugger (T4).
