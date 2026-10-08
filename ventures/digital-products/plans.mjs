// 14-day content plans for the two validation experiments (owner request 2026-10-08), rendered to phone-friendly PDFs.
// Posts reuse the real prompts and real planner pages, are value-first, say plainly that the product is ours, and
// never claim sales, reviews or results we do not have. Group and subreddit self-promotion rules come first.
import { PACKS } from "./prompts.mjs";
import { PLANNERS } from "./planners.mjs";
import { LISTINGS } from "./listings.mjs";

const pick = (slug, n) => {
  const pk = PACKS.find((p) => p.slug === slug);
  const all = pk.sections.flatMap((s) => s.prompts);
  return all[n - 1];
};

// ---------------------------------------------------------------- prompt packs (Gumroad)
const SB = "local-service-business-prompts", RE = "real-estate-agent-prompts", ET = "etsy-seller-prompts";
const promptPosts = [
  { id: "S1", pack: SB, where: "Facebook groups for contractors, cleaners, lawn care, HVAC; LinkedIn", hook: "Owners who hate writing review replies: this does it in a minute.", n: 6 },
  { id: "S2", pack: SB, where: "Facebook groups, Nextdoor for business, LinkedIn", hook: "Every missed call is a job going to someone else. Set up an automatic text-back. Here's a prompt to write it:", n: 11 },
  { id: "S3", pack: SB, where: "Facebook groups, LinkedIn, X/Threads", hook: "Most quotes die because nobody follows up. This prompt writes a polite 3-step follow-up (no pushy tactics):", n: 14 },
  { id: "S4", pack: SB, where: "LinkedIn, X/Threads, small-business Facebook groups", hook: "Posting on your Google Business Profile every week helps people find you. Here's the prompt I'd use:", n: 1 },
  { id: "R1", pack: RE, where: "Agent Facebook groups, LinkedIn", hook: "Agents using ChatGPT for listings: give it the fair housing rules first, or it will write things like \"perfect for young families.\" Paste this at the start of every chat:", context: true },
  { id: "R2", pack: RE, where: "Agent Facebook groups, LinkedIn, X/Threads", hook: "An MLS description from facts only, with no made-up features and no \"stunning\" on every line:", n: 1 },
  { id: "R3", pack: RE, where: "Agent Facebook groups, LinkedIn", hook: "Price-reduction conversations are hard. This prompt turns your data into calm talking points:", n: 28 },
  { id: "R4", pack: RE, where: "Instagram/Facebook, agent groups", hook: "Open house this weekend? One prompt gives you the social post and the text to your sphere:", n: 8 },
  { id: "E1", pack: ET, where: "Etsy seller Facebook groups, r/EtsySellers (check rules)", hook: "All 13 Etsy tags in one prompt:", n: 2 },
  { id: "E2", pack: ET, where: "Etsy seller groups, Threads/X", hook: "Etsy titles: the first 40 characters matter most. This prompt writes 5 that read naturally:", n: 1 },
  { id: "E3", pack: ET, where: "Etsy seller groups (digital sellers)", hook: "Digital sellers get \"I can't find my download\" every week. Save this prompt for the reply:", n: 21 },
  { id: "E4", pack: ET, where: "Etsy seller groups, Instagram", hook: "Not sure what photos your listing needs? This builds a 10-shot list you can do with a phone:", n: 12 },
];
const CTA = {
  [SB]: "I put 30 prompts like this (quote follow-ups, missed-call texts, service pages, review requests) into a $12 pack: [GUMROAD LINK]",
  [RE]: "That's part of a $12 pack I made: 30 prompts for listings, social posts, buyer and seller emails and video scripts, with fair housing guardrails: [GUMROAD LINK]",
  [ET]: "I have 30 more for titles, descriptions, photo shot lists and buyer messages in a $12 pack: [GUMROAD LINK]",
};
function postText(p) {
  const pk = PACKS.find((x) => x.slug === p.pack);
  const body = p.context ? pk.context.split("\n").slice(0, 3).join("\n") : `"${pick(p.pack, p.n)[1]}"`;
  return `${p.hook}\n\n${body}\n\n${CTA[p.pack]}`;
}

const day = (d) => new Date(Date.UTC(2026, 9, 8 + d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const promptCalendar = [
  ["Publish check: open all 3 Gumroad links on your phone, buy-button works, cover shows. Join 2 groups per audience (contractors, agents, Etsy sellers) and read their rules.", "Setup"],
  ["Post S1 (service owners)", "S1"], ["Post R1 (agents)", "R1"], ["Post E1 (Etsy sellers)", "E1"],
  ["Record video V1 (service pack) and post to TikTok/Reels/Shorts", "V1"], ["Post S2 + reply to every comment from earlier posts", "S2"],
  ["Day 7 review: fill in the tracker. Which audience clicked most? Put more of next week's posts there.", "Review"],
  ["Post R2 + record video V2 (real estate)", "R2"], ["Post E2 + record video V3 (Etsy)", "E2"], ["Post S3", "S3"], ["Post R3", "R3"],
  ["Post E3 and S4 in different groups", "E3"], ["Post R4 and E4", "R4"], ["Last push: re-share your best-performing post in a new group", "Best"],
  ["Day 14 decision (see the decision rules). Mark the experiment in /os → Experiments.", "Decide"],
];

const videoScripts = [
  { id: "V1", pack: SB, title: "Service business: review reply in 30 seconds", n: 6 },
  { id: "V2", pack: RE, title: "Real estate: compliant listing description", n: 1 },
  { id: "V3", pack: ET, title: "Etsy: 13 tags in one prompt", n: 2 },
];

// ---------------------------------------------------------------- planners (Etsy + Pinterest)
const plannerAudiences = {
  "adhd-college-planner": { groups: "student and study-tips communities that allow resources, college Facebook groups", angle: "Show the daily page: top 3, time blocks and brain dump." },
  "teacher-lesson-planner": { groups: "teacher Facebook groups, teacher Pinterest boards", angle: "Show the weekly lesson grid and the substitute sheet." },
  "small-business-budget-kit": { groups: "small business owner Facebook groups, LinkedIn", angle: "Show the monthly budget and the tax set-aside page." },
  "family-command-center": { groups: "mom and parenting Facebook groups, home organization groups", angle: "Show the meal planner with the grocery list on the fridge." },
  "service-business-planner": { groups: "cleaning, lawn care and contractor Facebook groups", angle: "Show the lead tracker and the week-in-numbers page." },
};
const plannerCalendar = [
  ["Publish all 5 Etsy listings. Open each one on your phone and check the photos, price and files.", "Launch"],
  ["Create a free Pinterest business account. Make 5 boards (one per planner). Claim your Etsy shop in Pinterest settings if it offers that.", "Setup"],
  ["Pin pin A for all 5 planners (images in the pins folder), each linking to its Etsy listing", "Pins A"],
  ["Post in 1 teacher group and 1 parent group (posts P2, P4)", "Groups"],
  ["Pin pin B for all 5 planners", "Pins B"],
  ["Print one planner page, take a real photo of it in use, and post a short 'plan with me' video", "Video"],
  ["Day 7 review: Etsy Stats (views, favorites, sales per listing). Note the top 2 listings.", "Review"],
  ["Re-pin the top 2 listings to a second board; post P5 (service business)", "Pins"],
  ["Post P3 (small business budget) on LinkedIn or a small business group", "Groups"],
  ["Post P1 (ADHD/college) where resources are allowed", "Groups"],
  ["Make a new pin from your real photo for the top listing", "Pins"],
  ["Reply to every message and favorite-to-cart question; check Etsy Stats again", "Check"],
  ["Last push: re-share your best post in a new group", "Best"],
  ["Day 14 decision (see the decision rules). Mark the experiment in /os → Experiments.", "Decide"],
];
const plannerPosts = PLANNERS.map((pl, i) => {
  const a = plannerAudiences[pl.slug];
  const L = LISTINGS[pl.slug];
  return {
    id: `P${i + 1}`, slug: pl.slug, title: pl.title, where: a.groups,
    text: `${L.heroLine}\n\nI made an undated printable for this: ${pl.pages.slice(1).map((p) => p.name.toLowerCase()).join(", ")}. US Letter and A4, print as many as you need.\n\nIt's $${L.price} on Etsy if it helps: [ETSY LINK]`,
    video: a.angle,
    pinA: { title: pl.title.slice(0, 100), description: `${L.heroLine} Undated printable PDF, US Letter and A4, instant download.`.slice(0, 500) },
    pinB: { title: `${pl.pages.length - 1} printable pages: ${pl.title}`.slice(0, 100), description: `What's inside: ${pl.pages.slice(1).map((p) => p.name).join(", ")}. Instant download.`.slice(0, 500) },
  };
});

export const PLANS = {
  prompts: { title: "Prompt Packs: 14-Day Content Plan", short: "Prompt packs", palette: { accent: "#2b4c7e", tint: "#e6ecf5" }, calendar: promptCalendar, posts: promptPosts.map((p) => ({ ...p, text: postText(p) })), videos: videoScripts, startLabel: (i) => day(i) },
  planners: { title: "Etsy Planners: 14-Day Content Plan", short: "Etsy planners", palette: { accent: "#2f7d4f", tint: "#e6f3ea" }, calendar: plannerCalendar, posts: plannerPosts, startLabel: (i) => `Day ${i + 1}  ·  ____` },
};
export { pick };
