// The full 4-week content plan (owner, 2026-10-12): every post with its text, in one calendar.
// Owner 2026-10-12 (later): Etsy planners ONLY. Prompt packs and the starter kit are stopped, so the calendar uses
// only planner carousels, planner videos, planner pins and planner group posts.
// Videos (story videos already made + the 27 problem-first Shorts), carousels, Pinterest pins and group posts.
// node ventures/content/full-plan.mjs -> out/full-content-plan.{pdf,md,csv} + out/pins/ (pin images to upload)
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { SHORTS } from "./problem-shorts.mjs";
import { LISTINGS, GUMROAD } from "../digital-products/listings.mjs";
import { LINKS } from "../ai-starter-kit/kit.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const OUT = here("./out/");
const ETSY = (slug) => LISTINGS[slug].url;
const GUM = (slug) => GUMROAD[slug].url;

// ---------------------------------------------------------------- story videos (already made)
const STORY = {
  V1: { file: "V1-local-service-business-prompts-story.mp4", link: GUM("local-service-business-prompts"), btn: "Prompts for Service Businesses ($12)",
    title: "Hate writing review replies? Do this", caption: "Review replies in under a minute. Paste the review, get 3 replies that thank them by name and mention the job. 30 prompts like this in my $12 pack. Link in bio → Prompts for Service Businesses.", tags: "#smallbusiness #chatgptprompts #googlereviews #contractor #cleaningbusiness" },
  V2: { file: "V2-real-estate-agent-prompts-story.mp4", link: GUM("real-estate-agent-prompts"), btn: "Prompts for Real Estate Agents ($12)",
    title: "Agents: give AI the fair housing rules first", caption: "Agents: give ChatGPT the fair housing rules before it writes your listing. This prompt writes an MLS description from your facts only. Link in bio → Prompts for Real Estate Agents.", tags: "#realestateagent #realtor #realestatetips #chatgptprompts #listingdescription" },
  V3: { file: "V3-etsy-seller-prompts-story.mp4", link: GUM("etsy-seller-prompts"), btn: "Prompts for Etsy Sellers ($12)",
    title: "All 13 Etsy tags in one prompt", caption: "All 13 Etsy tags in one prompt, each under 20 characters. 30 prompts for titles, descriptions and buyer messages in a $12 pack. Link in bio → Prompts for Etsy Sellers.", tags: "#etsyseller #etsytips #etsyshop #chatgptprompts #smallshop" },
  P1: { file: "P1-adhd-college-planner-story.mp4", link: ETSY("adhd-college-planner"), btn: "Printable Planners (Etsy)",
    title: "Brain has 40 tabs open? Try this planner", caption: "Brain has 40 tabs open? Brain dump first, pick 3 things, block your time, keep every due date in one place. Undated printable. Link in bio → Printable Planners (Etsy).", tags: "#collegelife #studytok #adhdplanner #studentplanner #printables" },
  P2: { file: "P2-teacher-lesson-planner-story.mp4", link: ETSY("teacher-lesson-planner"), btn: "Printable Planners (Etsy)",
    title: "Sunday night and no lesson plans? One page", caption: "Teachers: your whole week on one page. 6 periods, Mon–Fri, meetings, duties, copies to make, plus a sub sheet that's ready when you need it. Link in bio → Printable Planners (Etsy).", tags: "#teachersoftiktok #lessonplanning #teacherplanner #teacherlife #printables" },
  P3: { file: "P3-small-business-budget-kit-story.mp4", link: ETSY("small-business-budget-kit"), btn: "Printable Planners (Etsy)",
    title: "Where did the money go? One-page budget", caption: "Never sure where the money went? Plan the month, track every dollar, set aside taxes and see your real profit on one page. Link in bio → Printable Planners (Etsy).", tags: "#smallbusinessowner #budgeting #bookkeeping #businessplanner #printables" },
  P4: { file: "P4-family-command-center-story.mp4", link: ETSY("family-command-center"), btn: "Printable Planners (Etsy)",
    title: "Who has practice tonight? Check the fridge", caption: "Who has practice tonight? 🙋 One page holds the whole family week: schedule, meals + grocery list, chores and contacts. Undated, print it every week. Link in bio → Printable Planners (Etsy).", tags: "#familyplanner #momlife #homeorganization #printables #mealplanning" },
  P5: { file: "P5-service-business-planner-story.mp4", link: ETSY("service-business-planner"), btn: "Printable Planners (Etsy)",
    title: "Lost another lead? One sheet fixes it", caption: "Cleaning, lawn care or contracting? Track every call, follow up on quotes, chase invoices and see your week in numbers. Printable. Link in bio → Printable Planners (Etsy).", tags: "#cleaningbusiness #lawncare #contractor #smallbusiness #printables" },
  K1: { file: "K1-ai-starter-kit-story.mp4", link: LINKS.free, btn: "Free AI Tools List + 3 Starter Prompts",
    title: "20 side hustle ideas and zero started? Do this instead", caption: "Twenty ideas, zero started 😅 Paste your skills into one prompt, pick ONE thing you can make this weekend, then follow a 7-day checklist. Free AI tools list + starter prompts at the link in bio. No income promises, just the process.", tags: "#sidehustle #aitools #digitalproducts #chatgpt" },
  K2: { file: "K2-ai-starter-kit-story.mp4", link: LINKS.free, btn: "Free AI Tools List + 3 Starter Prompts",
    title: "Too many AI apps? Use one free tool per step", caption: "ChatGPT, Claude, Canva… which one do you actually need? 🤔 One free tool for each step: plan, make, sell, post. Plus the prompts to use with them. Free list at the link in bio.", tags: "#aitools #sidehustle #chatgpt #canva" },
};

// ---------------------------------------------------------------- carousels (captions live in CONTENT_PLAN.md)
const plan = readFileSync(here("./CONTENT_PLAN.md"), "utf8");
const CAROUSEL = {};
for (const m of plan.matchAll(/### (c\d\d) ([^\n]+)\n\*\*Shorts title:\*\* ([^\n]+)\n([^\n]+)\n(#[^\n]+)/g)) {
  CAROUSEL[m[1]] = { name: m[2], title: m[3], caption: m[4], tags: m[5] };
}
const CDIR = { c01: "c01-etsy-tags", c02: "c02-review-replies", c03: "c03-quote-followups", c04: "c04-realtor-listing", c05: "c05-free-ai-tools", c06: "c06-pick-one-idea",
  c07: "c07-teacher-lesson-planner", c08: "c08-adhd-college-planner", c09: "c09-family-command-center", c10: "c10-small-business-budget-kit", c11: "c11-service-business-planner" };
const CLINK = { c01: GUM("etsy-seller-prompts"), c02: GUM("local-service-business-prompts"), c03: GUM("local-service-business-prompts"), c04: GUM("real-estate-agent-prompts"),
  c05: LINKS.free, c06: LINKS.free, c07: ETSY("teacher-lesson-planner"), c08: ETSY("adhd-college-planner"), c09: ETSY("family-command-center"), c10: ETSY("small-business-budget-kit"), c11: ETSY("service-business-planner") };

// ---------------------------------------------------------------- Pinterest pins (images exported to out/pins/)
const BOARDS = { prompts: "AI Prompts for Small Business", side: "AI Side Hustle Tools", teacher: "Teacher Planners & Printables", student: "Student Planners & Study Tips",
  family: "Family Organization & Meal Planning", biz: "Small Business Planners & Budgets" };
const PINS = [
  { id: "PN01", img: "c01:2", board: BOARDS.prompts, link: CLINK.c01, title: "AI Prompt for All 13 Etsy Tags (Copy and Paste)", desc: "Stop guessing your Etsy tags. Copy this ChatGPT prompt to get all 13 tags, each under 20 characters, mixing what it is, who it's for and when it's used. 30 more Etsy seller prompts in the pack. #etsytips #etsyseo #chatgptprompts" },
  { id: "PN02", img: "c01:3", board: BOARDS.prompts, link: CLINK.c01, title: "ChatGPT Prompt for Etsy Titles That Read Naturally", desc: "Write 5 Etsy titles that put what it is in the first 40 characters and use only true features. A copy-and-paste AI prompt for Etsy sellers. #etsyseller #etsytitles #chatgptprompts" },
  { id: "PN03", img: "c02:2", board: BOARDS.prompts, link: CLINK.c02, title: "How to Reply to a 5-Star Google Review (AI Prompt)", desc: "Thank customers by name and mention the job in under 60 words. Copy this prompt for ChatGPT, Claude or Gemini. Part of 30 prompts for local service businesses. #googlereviews #smallbusinesstips #chatgptprompts" },
  { id: "PN04", img: "c02:3", board: BOARDS.prompts, link: CLINK.c02, title: "How to Respond to a Negative Review (Calm AI Prompt)", desc: "Don't argue in public. This prompt writes a calm, professional reply that owns what's fair and invites the customer to call. For contractors, cleaners and service businesses. #negativereviews #customerservice #smallbusiness" },
  { id: "PN05", img: "c03:3", board: BOARDS.prompts, link: CLINK.c03, title: "Quote Follow-Up Messages That Don't Sound Pushy", desc: "3 short follow-ups for a quote with no reply: day 2, day 5, day 10. No pressure tactics, no fake deadlines. A copy-and-paste AI prompt for contractors. #contractor #salestips #smallbusiness" },
  { id: "PN06", img: "c04:2", board: BOARDS.prompts, link: CLINK.c04, title: "AI Prompt for MLS Listing Descriptions (Facts Only)", desc: "Agents: write an MLS description from your facts only, fair-housing friendly, under 500 characters. Copy this prompt. #realestateagent #mlslisting #realtortips" },
  { id: "PN07", img: "c04:3", board: BOARDS.prompts, link: CLINK.c04, title: "Fair Housing Listing Check: AI Prompt for Realtors", desc: "Run your listing through this prompt to flag fair housing problems and exaggerations, with compliant rewrites. Always confirm with your broker. #fairhousing #realestateagent #realtor" },
  { id: "PN08", img: "c05:2", board: BOARDS.side, link: CLINK.c05, title: "Free AI Tools to Plan a Digital Product", desc: "One free AI tool for each step of planning a digital product. Free list + 3 starter prompts. Plans and fees change; check each site. #aitools #digitalproducts #sidehustle" },
  { id: "PN09", img: "c05:4", board: BOARDS.side, link: CLINK.c05, title: "Free Tools to Sell Digital Downloads", desc: "Where to sell your first digital product, and what each platform charges (check current fees). Free AI tools list at the link. #digitalproducts #etsy #gumroad" },
  { id: "PN10", img: "c06:2", board: BOARDS.side, link: CLINK.c06, title: "AI Prompt: Turn Your Skills Into Product Ideas", desc: "Paste your skills and interests into this prompt and get 15 small digital product ideas you could make in a weekend. Free with the AI tools list. No income promises. #sidehustleideas #digitalproducts #chatgptprompts" },
  { id: "PN11", img: "c07:4", board: BOARDS.teacher, link: CLINK.c07, title: "Weekly Lesson Plan Template, Printable and Undated", desc: "Plan 6 periods Monday to Friday on one page, plus meetings, duties and copies to make. Undated teacher planner printable, US Letter and A4. #lessonplanner #teacherplanner #teacherprintables" },
  { id: "PN12", img: "c07:3", board: BOARDS.teacher, link: CLINK.c07, title: "Year at a Glance for Teachers: Printable", desc: "Terms, breaks and testing windows on one page, August to July. Part of an undated teacher lesson planner. #teacherorganization #schoolyear #teacherprintables" },
  { id: "PN13", img: "c08:4", board: BOARDS.student, link: CLINK.c08, title: "Weekly Reset Planner for College Students", desc: "A simple weekly reset page for busy brains: what's due, what matters, what can wait. Undated printable college planner. #studytips #collegeplanner #adhdplanner" },
  { id: "PN14", img: "c08:3", board: BOARDS.student, link: CLINK.c08, title: "Semester at a Glance: Printable Student Planner", desc: "Every exam and big deadline for the semester on one page. ADHD-friendly undated college planner printable. #studentplanner #semesterplanner #studytok" },
  { id: "PN15", img: "c09:4", board: BOARDS.family, link: CLINK.c09, title: "Weekly Meal Planner + Grocery List Printable", desc: "Plan the week's meals and write the grocery list on the same page, then stick it on the fridge. Undated family planner printable. #mealplanning #familyplanner #groceryList" },
  { id: "PN16", img: "c09:3", board: BOARDS.family, link: CLINK.c09, title: "Family Weekly Schedule for the Fridge", desc: "Practice, appointments and who's driving: the whole family week on one printable page. #familyorganization #momlife #weeklyplanner" },
  { id: "PN17", img: "c10:3", board: BOARDS.biz, link: CLINK.c10, title: "Small Business Monthly Budget Printable", desc: "Plan the month and track every dollar in and out on paper. Undated small business budget kit. #smallbusinessbudget #bookkeeping #businessplanner" },
  { id: "PN18", img: "c10:4", board: BOARDS.biz, link: CLINK.c10, title: "Cash Flow Tracker for Small Businesses", desc: "See money in and money out week by week on one page. A printable tracker (not financial advice). #cashflow #smallbusinesstips #budgetplanner" },
  { id: "PN19", img: "c11:3", board: BOARDS.biz, link: CLINK.c11, title: "Weekly Job Schedule for Cleaning and Lawn Care Businesses", desc: "Every job, address and crew for the week on one printable page. Service business planner. #cleaningbusiness #lawncarebusiness #smallbusinessplanner" },
  { id: "PN20", img: "c11:4", board: BOARDS.biz, link: CLINK.c11, title: "Lead Tracker Printable for Service Businesses", desc: "Write every call on one sheet: name, number, what they need, called back. Never lose a lead. #leadtracker #contractor #smallbusiness" },
  ...Object.entries(STORY).map(([k, v], i) => ({ id: `PN${21 + i}`, img: null, video: v.file, board: k.startsWith("V") ? BOARDS.prompts : k.startsWith("K") ? BOARDS.side : { P1: BOARDS.student, P2: BOARDS.teacher, P3: BOARDS.biz, P4: BOARDS.family, P5: BOARDS.biz }[k],
    link: v.link, title: v.title, desc: `${v.caption.replace(/Link in bio →[^.]*\.?/, "").trim()} Animated with AI. ${v.tags.split(" ").slice(0, 3).join(" ")}` })),
];

// ---------------------------------------------------------------- group posts (value first; links only where the rules allow)
const GROUPS = [
  { id: "G01", where: "Facebook groups for Etsy sellers (search: \"Etsy sellers\", \"Etsy shop owners\")", product: "Etsy Seller Prompts",
    text: "The prompt I use for all 13 Etsy tags (free, copy it):\n\n\"Give me 13 Etsy tags (each max 20 characters, multi-word phrases where possible) for [PRODUCT]. Mix: what it is, who it is for, occasion, style, and use. No repeated words across more than 3 tags. Output as a comma-separated list.\"\n\nI still check every tag against what I actually sell. Happy to share my title prompt too if it helps anyone." },
  { id: "G02", where: "Small business owner groups (search: \"small business owners\" + your city or \"service business\")", product: "Prompts for Service Businesses",
    text: "Got a 1-star review this week? Here's how I'd reply without sounding defensive (free AI prompt):\n\n\"Write a calm, professional public reply to this negative review: \"[REVIEW TEXT]\". Our side of the story: [WHAT ACTUALLY HAPPENED]. Do not argue, do not share private details, take responsibility where it is fair, and invite them to contact [NAME] at [PHONE OR EMAIL] to fix it. Under 90 words.\"\n\nThe key is owning what's fair in public and moving the rest to a phone call." },
  { id: "G03", where: "Home service groups: cleaning, lawn care, HVAC, plumbing, contractors", product: "Prompts for Service Businesses",
    text: "If you miss calls on the job, set up a missed-call text-back. Here's a prompt to write it:\n\n\"Write a text we send automatically when we miss a call: introduce [BUSINESS NAME], say we will call back within [TIME], and ask what they need help with. Under 250 characters. Give 3 versions.\"\n\nMost phone carriers and business apps let you set an auto-reply. What do you all use?" },
  { id: "G04", where: "Real estate agent groups (search: \"real estate agents\", \"realtors\" + your state)", product: "Prompts for Real Estate Agents",
    text: "Before you post an AI-written listing, run it through a fair housing check. The prompt I use:\n\n\"Review this listing text for fair housing problems, unverifiable claims and exaggerations: [TEXT]. List each issue, why it matters, and a compliant rewrite. Then give the corrected full text.\"\n\nNot a replacement for your broker's review, but it catches \"perfect for families\" and friends before anyone else sees them." },
  { id: "G05", where: "Teacher groups (search: \"teachers\", \"elementary teachers\", \"middle school teachers\")", product: "Teacher planner",
    text: "Sick-day prep tip: fill in one sub sheet now so it's ready on the worst morning. Mine has:\n• Daily schedule + bell times\n• Duties and where to be\n• 2–3 helpful students\n• Where the plans, seating charts and emergency info are\n• Who to ask next door\n\nWhat else would you add? (I made a printable version with this page if anyone wants it. Happy to share if links are allowed here.)" },
  { id: "G06", where: "Parenting / family organization / meal planning groups", product: "Family planner",
    text: "What finally stopped the 15 \"what's for dinner?\" texts in our house: the week's meals and the grocery list on ONE page on the fridge. Plan Sunday, shop once, and everyone checks the fridge instead of texting.\n\nHow do you all plan meals? Apps, paper, winging it?" },
  { id: "G07", where: "College student / study / ADHD study groups", product: "College planner",
    text: "Study trick for when your brain has 40 tabs open: brain dump EVERYTHING on one page (assignments, errands, random worries), then circle just 3 for today. Everything else waits.\n\nIt sounds too simple, but picking 3 is what makes starting possible. Anyone else do this?" },
  { id: "G08", where: "Small business / self-employed groups", product: "Budget kit",
    text: "Simple habit for self-employed folks: every time money comes in, write down a set-aside amount for taxes before you spend anything. One line per payment. (Ask your accountant what % fits you; this is just the tracking habit, not tax advice.)\n\nWhat's helped you stay ahead of tax time?" },
  { id: "G09", where: "Side hustle / beginner online business groups (check the self-promo rules first)", product: "Free AI tools list",
    text: "Free AI tools I'd use to make and sell a first small digital product:\n• Plan and write: ChatGPT, Claude or Gemini (free plans)\n• Make it: Canva or Google Docs → export as PDF\n• Sell it: Etsy or Gumroad (check their current fees)\n• Get seen: Pinterest + short videos (label AI videos)\n\nNo income promises, it's just the toolset. I put this list plus 3 starter prompts in a free download if anyone wants it (I'll drop it in the comments if that's allowed)." },
  { id: "G10", where: "Etsy digital product seller groups", product: "Etsy Seller Prompts",
    text: "Copy-paste reply for \"I can't find my download\" messages:\n\n\"Hi [NAME]! So sorry for the trouble. On Etsy, go to You > Purchases and reviews, find this order and tap Download files. On a phone it's sometimes easier in a web browser. If it still doesn't show, reply here and I'll send it right over!\"\n\nSaved me so many minutes. Edit it to match your shop." },
  { id: "G11", where: "Contractor / trades business groups", product: "Prompts for Service Businesses",
    text: "Quote follow-up schedule that doesn't feel pushy:\n• Day 2: short text: \"just making sure the quote came through\"\n• Day 5: email answering common questions\n• Day 10: polite last check: \"no worries if the timing's not right\"\n\nNo fake deadlines. Do you follow up on quotes, or wait for them to call?" },
  { id: "G12", where: "Digital product / printable seller groups", product: "AI Starter Kit",
    text: "How I pick a launch price for a printable without guessing: search 8–10 similar listings, write down the prices, and price in the middle of the range. Leave room for a bundle later.\n\nThen I check what's included in the cheaper and pricier ones. What's your pricing method?" },
  { id: "G13", where: "Teacher groups", product: "Teacher planner",
    text: "How do you track grading without a spreadsheet open all day? I keep one page per class: assignment across the top, students down the side, a check or score in each box. At a glance I can see who's missing what before conferences.\n\nPaper people or gradebook-only people?" },
  { id: "G14", where: "Parenting / family organization groups", product: "Family planner",
    text: "What ended the \"it's not my turn!\" fights here: a chore chart on the fridge with names, days and checkboxes. Kids check their own box, and the chart (not me) decides whose turn it is.\n\nWhat chores do your kids do at what age?" },
  { id: "G15", where: "Home service groups: cleaning, lawn care, contractors", product: "Service business planner",
    text: "Simple lead habit: every call goes on one sheet the moment it comes in: name, number, what they need, and a box for \"called back\". End of day, anything without a check gets a call.\n\nHow do you keep track of leads when you're on a job all day?" },
  { id: "G16", where: "Small business / self-employed groups", product: "Budget kit",
    text: "End-of-month habit that changed how I see my business: one page with money in, money out, and what's actually left. Busy month ≠ profitable month, and you only see it when you write it down.\n\nDo you check profit monthly, quarterly, or at tax time?" },
];

// ---------------------------------------------------------------- calendar (4 weeks)
const S = Object.fromEntries(SHORTS.map((s) => [s.name.slice(0, 3), s]));
const day = (d, carousel, video, pins, group = null, note = "") => ({ d, carousel, video, pins, group, note });
const CAR = ["c09", "c07", "c08", "c10", "c11"];
const PINROT = ["PN15", "PN11", "PN13", "PN17", "PN19", "PN27", "PN16", "PN12", "PN14", "PN18", "PN20", "PN25", "PN24", "PN26", "PN28"];
const EVE = [
  // week 1
  ["Mon Oct 13", "S19"], ["Tue Oct 14", "P1", "G05"], ["Wed Oct 15", "S13", null, "Day-7 review: send Claude views, saves, Linktree clicks and Etsy Stats."], ["Thu Oct 16", "P3", "G06"],
  ["Fri Oct 17", "S25"], ["Sat Oct 18", "P4"], ["Sun Oct 19", "S15"],
  // week 2
  ["Mon Oct 20", "S16"], ["Tue Oct 21", "P5", "G07"], ["Wed Oct 22", "S22", null, "Day-14 decision for the planner experiment (Claude helps)."], ["Thu Oct 23", "S20", "G15"],
  ["Fri Oct 24", "S26", null, "Possible moving weekend: schedule ahead or skip."], ["Sat Oct 25", "S14", null, "Possible moving weekend."], ["Sun Oct 26", "S17"],
  // week 3
  ["Mon Oct 27", "S23"], ["Tue Oct 28", "S21", "G13"], ["Wed Oct 29", "S18"], ["Thu Oct 30", "S27", "G08"],
  ["Fri Oct 31", "S24", null, "Possible moving weekend: schedule ahead or skip."], ["Sat Nov 1", "P2", null, "Possible moving weekend."], ["Sun Nov 2", "S19", null, "Repost: swap in your best performer so far if it isn't this one."],
  // week 4: repeat the winners (Claude swaps in the top performers after Day 14)
  ["Mon Nov 3", "S13"], ["Tue Nov 4", "S25", "G14"], ["Wed Nov 5", "S16"], ["Thu Nov 6", "S22", "G16"],
  ["Fri Nov 7", "S20", null, "30 days of Money OS data: Phase 2 decisions can start."], ["Sat Nov 8", "S15"], ["Sun Nov 9", "S17", null, "Plan the next 4 weeks with Claude from the real numbers (and new planner ideas)."],
];
const CAL = EVE.map(([d, v, g, note], i) => day(d, (i % 7 === 5 || i % 7 === 6) && /Oct 2[45]|Oct 31|Nov 1/.test(d) ? null : CAR[i % CAR.length], [v], [PINROT[(2 * i) % PINROT.length], PINROT[(2 * i + 1) % PINROT.length]], g ?? null, note ?? ""));

// ---------------------------------------------------------------- pin images
mkdirSync(`${OUT}pins`, { recursive: true });
const pinFile = (p) => {
  if (!p.img) return p.video;
  const [c, n] = p.img.split(":");
  const src = `${OUT}${CDIR[c]}/tall/${String(n).padStart(2, "0")}.png`;
  const dst = `${OUT}pins/${p.id}.png`;
  if (existsSync(src)) copyFileSync(src, dst);
  return `${p.id}.png`;
};
const USED = new Set(CAL.flatMap((c) => c.pins));
for (const p of PINS) if (USED.has(p.id)) p.file = pinFile(p);

// ---------------------------------------------------------------- render
const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SDIR = (id) => { const sh = S[id]; const slug = { "Teacher Weekly Lesson Planner": "teacher-lesson-planner", "ADHD-Friendly College Planner": "adhd-college-planner", "Family Weekly Command Center": "family-command-center", "Small Business Monthly Budget Kit": "small-business-budget-kit", "Service Business Weekly Planner": "service-business-planner" }[sh.product]; return `${id.toLowerCase()}-${slug}`; };
const vid = (id) => STORY[id] ? { kind: "Story video (ready)", ...STORY[id], name: `${id} · ${STORY[id].title}` } : { kind: "Problem-first Short (free slide version ready; Kling version optional)", ...S[id], file: `${SDIR(id)}/${SDIR(id)}-shorts.mp4`, btn: S[id].link };
const pin = (id) => PINS.find((p) => p.id === id);
const grp = (id) => GROUPS.find((g) => g.id === id);

let md = `# Full content plan: Oct 13 – Nov 9, 2026\n\nDaily: 1 carousel (midday) · 1–2 videos (6–9 pm) · 1–2 Pinterest pins · group post 2× a week. Reply to every comment. Linktree in bio.\n\n`;
const csv = [["date", "carousel", "videos", "pins", "group post", "note"]];
for (const c of CAL) {
  md += `## ${c.d}\n`;
  if (c.note) md += `> ${c.note}\n\n`;
  if (c.carousel) { const k = CAROUSEL[c.carousel]; md += `### Carousel ${c.carousel}: ${k.name} (midday)\nFiles: \`${CDIR[c.carousel]}/\` slides (TikTok photo mode + IG carousel) and \`${CDIR[c.carousel]}-shorts.mp4\` (YouTube Shorts)\n- **Title:** ${k.title}\n- **Caption:** ${k.caption}\n- **Hashtags:** ${k.tags}\n\n`; }
  for (const v of c.video.map(vid)) md += `### Video: ${v.name} (evening)\n*${v.kind}*${v.file ? ` · file \`${v.file}\`` : ""}\n- **Title:** ${v.title}\n- **Caption:** ${v.caption}\n- **Hashtags:** ${v.tags}\n\n`;
  for (const p of c.pins.map(pin)) md += `### Pin ${p.id} → board "${p.board}"\nImage: \`${p.file}\` · Link: ${p.link}\n- **Title:** ${p.title}\n- **Description:** ${p.desc}\n\n`;
  if (c.group) { const g = grp(c.group); md += `### Group post ${g.id} (${g.product})\nWhere: ${g.where}\n\n${g.text}\n\n`; }
  csv.push([c.d, c.carousel ?? "", c.video.join(" + "), c.pins.join(" + "), c.group ?? "", c.note]);
}
md += `## Rules for group posts\n- Read each group's rules first. Many ban links or self-promotion. Post the value (the prompt or tip) in full, with no link; share the link only in comments and only if allowed or someone asks.\n- One group per topic per week. Never paste the same post into 10 groups the same day (that gets accounts flagged).\n- Answer every reply. No income claims, no fake results.\n`;
writeFileSync(`${OUT}full-content-plan.md`, md);
writeFileSync(`${OUT}full-content-plan.csv`, csv.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n"));

const font = (f) => `data:font/woff2;base64,${readFileSync(here(`../digital-products/fonts/${f}`)).toString("base64")}`;
const block = (tag, label, title, rows) => `<div class="b ${tag}"><div class="k">${esc(label)}</div><div class="t">${esc(title)}</div>${rows.map(([l, v]) => `<div class="r"><b>${esc(l)}</b><span>${esc(v).replace(/\n/g, "<br>")}</span></div>`).join("")}</div>`;
const days = CAL.map((c) => {
  const parts = [];
  if (c.carousel) { const k = CAROUSEL[c.carousel]; parts.push(block("car", `Carousel ${c.carousel} · midday`, k.name, [["Files", `${CDIR[c.carousel]}/ slides + ${CDIR[c.carousel]}-shorts.mp4`], ["Title", k.title], ["Caption", k.caption], ["Hashtags", k.tags]])); }
  for (const v of c.video.map(vid)) parts.push(block("vid", `${v.kind} · evening`, v.name, [...(v.file ? [["File", v.file]] : [["Make", "Video prompt in problem-shorts.pdf"]]), ["Title", v.title], ["Caption", v.caption], ["Hashtags", v.tags]]));
  for (const p of c.pins.map(pin)) parts.push(block("pin", `Pinterest ${p.id} · board: ${p.board}`, p.title, [["Image", p.file], ["Link", p.link], ["Description", p.desc]]));
  if (c.group) { const g = grp(c.group); parts.push(block("grp", `Group post ${g.id} · ${g.product}`, g.where, [["Post", g.text]])); }
  return `<section class="day"><h2>${esc(c.d)}</h2>${c.note ? `<div class="note">${esc(c.note)}</div>` : ""}${parts.join("")}</section>`;
}).join("");
const overview = `<table class="ov"><tr><th>Date</th><th>Carousel</th><th>Video(s)</th><th>Pins</th><th>Group</th></tr>${CAL.map((c) => `<tr><td>${esc(c.d)}</td><td>${esc(c.carousel ?? "–")}</td><td>${esc(c.video.join(" + "))}</td><td>${esc(c.pins.join(", "))}</td><td>${esc(c.group ?? "–")}</td></tr>`).join("")}</table>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url(${font("Inter.woff2")}) format("woff2");font-weight:100 900}
@font-face{font-family:Serif;src:url(${font("DMSerifDisplay.woff2")}) format("woff2")}
@page{size:8.5in 11in;margin:.5in .55in}
body{font:9.5pt/1.45 Inter;color:#23272f}
h1{font:400 26pt/1.1 Serif;margin:0 0 6pt} h2{font:400 17pt/1.1 Serif;margin:0 0 6pt;border-bottom:2pt solid #2b4c7e;padding-bottom:3pt}
.intro{background:#eef2f6;border-radius:8pt;padding:10pt 13pt;margin:0 0 12pt}
.intro li{margin:2pt 0}
table.ov{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:6pt} .ov th{background:#2b4c7e;color:#fff;text-align:left;padding:4pt 5pt} .ov td{border-bottom:.5pt solid #dde1e7;padding:3pt 5pt}
.day{break-before:page}
.note{background:#fff6dd;border-radius:6pt;padding:6pt 9pt;margin:0 0 8pt;font-weight:600}
.b{border:.75pt solid #c9ced6;border-left:5pt solid #999;border-radius:6pt;padding:8pt 10pt;margin:0 0 8pt;break-inside:avoid}
.b.car{border-left-color:#3d5a40}.b.vid{border-left-color:#c8553d}.b.pin{border-left-color:#e60023}.b.grp{border-left-color:#2b4c7e}
.k{font:700 7pt Inter;letter-spacing:.14em;text-transform:uppercase;color:#6b7280}
.t{font:700 10.5pt Inter;margin:2pt 0 5pt}
.r{display:grid;grid-template-columns:.9in 1fr;gap:6pt;margin:2pt 0}.r b{font:700 7.5pt Inter;text-transform:uppercase;letter-spacing:.08em;color:#2b4c7e;padding-top:1.5pt}
</style></head><body>
<h1>Full content plan: Oct 13 – Nov 9</h1>
<div class="intro"><b>Every day:</b><ul>
<li><b>Midday:</b> 1 carousel. Slides go to TikTok photo mode and Instagram; the -shorts.mp4 goes to YouTube Shorts. Add a sound in each app.</li>
<li><b>6–9 pm:</b> the video(s) on TikTok, Reels and Shorts, with each app's AI label on.</li>
<li><b>Pinterest:</b> 1–2 pins. Image files are in the pins folder; the link goes straight to the product.</li>
<li><b>Group posts:</b> 2× a week. Post the value in full, add a link only where the rules allow.</li>
<li><b>Every evening:</b> reply to every comment.</li></ul>
<b>Etsy planners only</b> (owner, Oct 12). Every post sends people to the Etsy shop through the Linktree.<br>
<b>Videos:</b> "Story video (ready)" files are in digital-products/out/videos/story. Every problem-first Short has a free slide version ready (sNN-.../sNN-...-shorts.mp4). The Kling story version is optional (video prompt in problem-shorts.pdf, 37.5 credits).<br>
<b>Rules:</b> one problem per post, no income or sales claims, label AI videos, never invent results.</div>
${overview}
${days}
<section class="day"><h2>Group post rules</h2><ul><li>Read each group's rules first. Many ban links or self-promotion. Post the value in full with no link; share the link in comments only if allowed or someone asks.</li><li>One group per topic per week; never paste the same post into many groups on the same day.</li><li>Answer every reply. No income claims, no fake results.</li></ul></section>
</body></html>`;
const { chromium } = createRequire(new URL("../digital-products/package.json", import.meta.url))("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const pg = await browser.newPage();
await pg.setContent(html, { waitUntil: "load" });
await pg.evaluate(() => document.fonts.ready);
await pg.pdf({ path: `${OUT}full-content-plan.pdf`, width: "8.5in", height: "11in", printBackground: true, preferCSSPageSize: true });
await browser.close();
const missing = Object.keys(CDIR).filter((k) => !CAROUSEL[k]);
console.log(`days ${CAL.length}, pins ${PINS.length}, groups ${GROUPS.length}, carousel captions ${Object.keys(CAROUSEL).length}${missing.length ? ` MISSING ${missing}` : ""}`);
