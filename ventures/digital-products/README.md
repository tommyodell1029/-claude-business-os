# Digital products: planners (Etsy) and AI prompt packs (Gumroad)

Built 2026-10-08 for the two Money OS validation experiments the owner started:

| Experiment | Method | Target | Budget | Deadline |
|---|---|---|---|---|
| Validate: Printable planner templates for niche audiences | 5 Etsy listings | 3 sales in 14 days | $1 (listing fees) | 14 days after the listings go live |
| Validate: AI prompt packs for specific workflows | 3 Gumroad products | 3 sales in 14 days | $0 | 14 days after the products go live |

Niches come from the stored research evidence. Niche planners face far less competition than generic ones, and buyers favor role-specific prompt packs over generic libraries.

## What is ready to upload (`out/`)

| Folder | Contents |
|---|---|
| `out/planners/<slug>/` | The product: `<slug>-US-Letter.pdf` and `<slug>-A4.pdf` |
| `out/prompts/<slug>/` | The product: `<slug>.pdf` (designed) and `<slug>.txt` (easy copy) |
| `out/listing-images/etsy/<slug>/` | 4 listing photos, 2700×2025: hero, what's inside, close-up, how it works |
| `out/listing-images/gumroad/<slug>/` | Cover and preview (1280×720) and thumbnail (600×600) |
| `out/listings/` | One sheet per listing with title, tags, description, suggested price, and which files and images to upload |

Planners:
- `adhd-college-planner` (8 pages)
- `teacher-lesson-planner` (8)
- `small-business-budget-kit` (9)
- `family-command-center` (8)
- `service-business-planner` (8)

Prompt packs (30 prompts each):
- `local-service-business-prompts`
- `real-estate-agent-prompts`
- `etsy-seller-prompts`

## Content plans and Pinterest pins (`out/content-plans/`, `out/pins/`)

**`prompt-packs-content-plan.pdf`** covers Oct 8 to Oct 22, 2026 and includes:
- posting rules
- a 14-day calendar with checkboxes
- 12 ready-to-post texts, each built on a real prompt from the packs
- 3 screen-recording video scripts
- a results tracker
- the day-14 decision rules

**`etsy-planners-content-plan.pdf`** covers 14 days from the Etsy launch and includes:
- a calendar with Pinterest setup
- 5 group posts
- pin titles and descriptions
- a tracker
- the decision rules

**`out/pins/<slug>/`** holds two 1000×1500 Pinterest pins per planner, rendered from the real pages. Rebuild with `node build.mjs plans` and `node build.mjs pins`.

## Promo videos (`out/videos/`)

There are 8 vertical videos (1080×1920, about 18–24 s each) for TikTok, Instagram Reels and YouTube Shorts:
- **V1–V3:** one per prompt pack. Each shows the real prompt filled with labelled example details, then an example AI answer, then the pack.
- **P1–P5:** one per planner. Each walks through 3 real pages and ends with the cover.

Voiceovers were made in ElevenLabs (voice "Maya", about $0.05 each) and saved in `out/videos/audio/`; the ElevenLabs flow is "LaunchPad experiment videos - voiceovers".

Rebuild with `FFMPEG=<path to ffmpeg> node videos.mjs [V1|P3|…]`.

No AI-generated footage is used, so the product shown is always the real file.

## Honesty rules used
- **Images:** every listing image is a render of the real page in the file. There are no fake mockups, reviews, "best seller" badges or sales claims.
- **Disclosure:** descriptions say the designs were made with the help of AI tools. Etsy asks for that disclosure; check the listing form and its creativity standards when you publish.
- **Digital wording:** descriptions say plainly that nothing ships and the files are for personal use.
- **Prompts:** every prompt tells the AI to use only facts the buyer gives and to ask when something is missing. The real estate pack has fair housing guardrails.
- **Prices:** suggested from the research (planners $6.99–$7.99, prompt packs $12). The owner decides.

## Upload steps (owner)
1. **Etsy:** Shop Manager > Listings > Add a listing.
   - Type: Digital.
   - Upload the 4 images in order, then both PDFs.
   - Paste the title, tags and description from `out/listings/etsy-<slug>.md`.
2. **Gumroad:** New product > Digital product.
   - Upload the PDF and TXT, then the cover, preview and thumbnail.
   - Paste the name, summary and description from `out/listings/gumroad-<slug>.md`.
3. **Tell Claude the go-live date.** The experiments' start dates are then moved so the 14 days count from launch.
4. **Record each payout** in `/os` > Revenue > Record revenue: source "marketplace" for Etsy, "other" for Gumroad.

## Rebuild after edits
Edit `planners.mjs`, `prompts.mjs` or `listings.mjs`, then run `npm install` (Playwright, pinned) and `node build.mjs all`. It uses the Chromium at `/opt/pw-browsers/chromium`, or set `CHROMIUM_PATH`.

Fonts: Inter and DM Serif Display, SIL Open Font License (`fonts/OFL-*.txt`), embedded in the PDFs, which the license allows.

### UGC versions (`out/videos/ugc/`)

The same 8 videos, remade in a UGC style (about 16–21 s each). An AI-generated presenter speaks the hook to camera, then the video cuts to the real product scenes while she voices the rest.
- The presenter is AI-generated. The image is gpt-image-2.5 and the talking head is Creatify Aurora at 720p. Her voice is eleven_v4, voice "Maya".
- Each video carries an "AI-generated presenter" label on screen while she is visible.
- She speaks as the maker ("I made…") and never as a customer, and she makes no claims about sales or reviews.
- Cost: the talking heads came to about 39k ElevenLabs credits, roughly $7. The v4 voice was free during the promotion.
- The ElevenLabs flow is "LaunchPad UGC videos (v4 + Aurora)". Each video has two source files: `<id>-face.mp4` (the hook clip) and `<id>-rest.mp3` (the rest of the voiceover). The scripts are in `UGC_SCRIPTS` in `videos.mjs`.
- Many platforms require you to turn on their own AI-content label when you post these (TikTok: "AI-generated content"; Instagram: "AI info"; YouTube: "altered or synthetic content").

To rebuild, run `FFMPEG=<path to ffmpeg> node videos.mjs --ugc [V1|P3|…]`.

### Animated story versions (`out/videos/story/`) — the standard format
All new videos follow `STORY_VIDEOS.md`, which has the template, the rules and the 8 scripts.
The owner's preferred format (2026-10-10). Each one is about 18.5 s: a 15 s 3D-animated skit, then the real product end card. In the skit, a character struggles with the problem, a friend mentions the product in general terms, and the character's day is calmer afterwards.
- The skits were made with Kling 3 Pro on Higgsfield, which generates the dialogue lip-synced. Each costs 37.5 Higgsfield credits, 300 for all 8.
- Every skit carries an on-screen "Animated dramatization · AI-generated" label. The scripts make no claims about sales, money or results. The "after" scene only shows the task done and the character calmer.
- To rebuild, run `FFMPEG=<path to ffmpeg> node videos.mjs --story [id]`. It needs `out/videos/story/<id>-clip.mp4`, plus the normal build's end-card stills in `out/videos/tmp/`.
- The raw Kling clips are not in git because they're too large. They stay in the Higgsfield library, under these job IDs:
  - V1: `32053136-7917-408b-8269-b8d752a45ded`
  - V2: `b990d146-d561-431a-9bd8-b88e1279ca96`
  - V3: `6cd38af4-2849-4314-b4b6-08e8a67049db`
  - P1: `cb8d0a2f-07ac-469d-9c70-d4e7e247ad2b`
  - P2: `d9a7ddb6-0873-448c-a7d8-6b0ea2aa2eb9`
  - P3: `a5fa5b28-f941-49ee-8b04-37dd78691620`
  - P4: `d54ff766-cbed-408f-ad30-78f7e8f3c3a7`
  - P5: `be9d1c69-2bc5-4acf-b472-36b32b20c216`

  To rebuild a video, download its clip to `out/videos/story/<id>-clip.mp4`.
