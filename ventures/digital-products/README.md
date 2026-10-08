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
