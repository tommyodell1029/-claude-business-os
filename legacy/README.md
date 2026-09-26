# /legacy

Code kept until the owner approves removal (phase T9). Nothing here is used by LaunchPad Local.

| Path | Why it moved | Still runs? |
|---|---|---|
| `bos-freelance-ops/` | Previous Fiverr/Upwork freelance business OS (Python stdlib + SQLite CLI). Different business; not part of the receptionist product. | Yes: `cd legacy/bos-freelance-ops && python -m unittest tests.test_bos` (57 tests) and `python -m bos status`. |
| `bos-freelance-ops/CLAUDE.md` | The old operating manual. Merged into the root CLAUDE.md; conflicts are listed there. | n/a |
| `bos-freelance-ops/demos/n8n_ai_support_desk.ts` | n8n is retired. See the note below. The credential reference IDs were replaced with placeholders. | No (n8n only) |

## Old n8n workflow: "DEMO - AI Support Desk (Gmail + Chat, one knowledge base)"
- n8n ID `QVPZ1R0WX5uaqVaH`. Inactive and never published. The account's execution limit is exhausted, so it cannot run anyway.
- **What it did.** A Gmail trigger polled the inbox every 5 minutes for unread mail from the last 2 days. Claude Haiku classified each message as support, not support, or unclear. For support questions, Haiku drafted an answer using only a fictional knowledge base (Brightside Home Cleaning, Jacksonville) and saved it as a Gmail draft, never sending it. Emails it could not answer were labelled for a human to handle. A separate chat trigger answered questions from the same knowledge base.
- **Replacement.** None is needed for LaunchPad Local. It was an email-triage demo, not post-call logic. Its "answer only from the knowledge base; never invent prices" rules will be reused in the voice agent's prompt (phase T3).
- The workflow in the n8n account has been left untouched.
