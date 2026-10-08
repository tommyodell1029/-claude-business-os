// Listing copy for Etsy (planners) and Gumroad (prompt packs), plus which real pages each listing image shows.
// Rules: only true features of the files, no review/sales/"best seller" claims, digital-download wording, and an
// AI-assistance disclosure (Etsy requires disclosure when AI tools helped create a design). Prices are SUGGESTIONS
// from the stored research (printables average about $4.93; niche planners price ~30% higher; Gumroad niche packs
// $12-$49); the owner sets the final price.

const AI_NOTE = "Designed by me with the help of AI tools, then checked page by page.";
const DIGITAL = [
  "INSTANT DOWNLOAD: this is a digital file. Nothing will be shipped.",
  "Files: PDF in US Letter (8.5 x 11 in) and A4. Print at home or at a print shop.",
  "Personal use only. Please do not share, resell or redistribute the files.",
  "Printed colors can differ slightly from your screen.",
];

function etsyDescription(hook, includes, howTo) {
  return [hook, "", "WHAT'S INCLUDED", ...includes.map((x) => `• ${x}`), "", "HOW IT WORKS", ...howTo.map((x, i) => `${i + 1}. ${x}`), "", "GOOD TO KNOW", ...DIGITAL.map((x) => `• ${x}`), `• ${AI_NOTE}`].join("\n");
}

const STEPS = ["Buy and download the PDFs from your Etsy account (Purchases and reviews > Download files).", "Choose US Letter or A4 and print the pages you need.", "Reprint the undated pages whenever you need fresh ones."];

export const LISTINGS = {
  "adhd-college-planner": {
    heroLine: "Brain dump, pick your top 3, block your time, and never miss a due date.",
    heroPages: [4, 3, 5], detailPage: 4,
    detailPoints: ["Top 3 that make the day count", "Hour-by-hour time blocks, 8 am to 9 pm", "Brain dump space to park distractions", "Focus-block tracker and one daily win"],
    price: "6.99",
    title: "ADHD Planner for College Students Printable, Undated Daily Planner, Student Assignment Tracker, Study Planner PDF, Letter & A4",
    tags: ["adhd planner", "college planner", "student planner", "adhd printable", "assignment tracker", "study planner", "daily planner pdf", "undated planner", "exam planner", "brain dump", "time blocking", "semester planner", "focus planner"],
    description: etsyDescription(
      "A simple, low-overwhelm planner for college students who get distracted easily: empty your head, pick three things, block your time and keep every due date in one place.",
      ["Cover and how-to page", "Semester at a glance", "Weekly reset with one main goal and a self-care check", "Daily focus page: top 3, time blocks (8 am-9 pm), brain dump, focus-block tracker, one daily win", "Assignment tracker", "Exam prep countdown", "Brain dump page that sorts into do today / schedule / later"],
      STEPS,
    ) + "\n• This planner is an organizing tool, not medical advice or treatment.",
  },
  "teacher-lesson-planner": {
    heroLine: "Weekly lesson plans for six periods, plus grading, parent contacts and a ready sub sheet.",
    heroPages: [3, 7, 2], detailPage: 3,
    detailPoints: ["Six periods or subjects, Monday to Friday", "Weekly priorities, meetings and duties", "Copies-to-make checklist", "Unit and week fields at the top"],
    price: "7.99",
    title: "Teacher Planner Printable, Undated Weekly Lesson Plan Template, Grading Tracker, Parent Contact Log, Substitute Binder PDF",
    tags: ["teacher planner", "lesson plan template", "lesson planner", "teacher printable", "undated planner", "grading tracker", "parent contact log", "substitute binder", "sub plans", "teacher binder", "weekly planner pdf", "classroom planner", "teacher gift"],
    description: etsyDescription(
      "An undated teacher planner you can print every week: lesson plans for six periods or subjects, plus the logs and sheets that make school life easier.",
      ["Cover and how-to page", "Year at a glance (August to July)", "Weekly lesson plan: 6 periods x 5 days, priorities, meetings & duties, copies to make", "Daily plan with schedule and to-do list", "Grading tracker for up to 4 classes", "Parent communication log", "Substitute info sheet: schedule, procedures, helpers, emergency plan"],
      STEPS,
    ),
  },
  "small-business-budget-kit": {
    heroLine: "Plan the month, track cash in and out, set aside taxes and see your real profit.",
    heroPages: [2, 3, 7], detailPage: 2,
    detailPoints: ["Income, fixed and variable costs", "Planned vs actual columns", "Monthly totals with tax set-aside", "Notes for what to change next month"],
    price: "7.99",
    title: "Small Business Budget Planner Printable, Monthly Budget Template, Cash Flow Tracker, Expense Log, Profit and Tax Tracker PDF",
    tags: ["business planner", "small business", "budget planner", "budget template", "expense tracker", "cash flow tracker", "profit tracker", "income tracker", "invoice tracker", "tax savings tracker", "bookkeeping", "monthly budget", "business printable"],
    description: etsyDescription(
      "A printable money kit for solo owners and small teams: plan each month, record every dollar in and out, put money aside for taxes and see your real profit on one page.",
      ["Cover and how-to page", "Monthly budget: income, fixed costs, variable costs, planned vs actual", "Weekly cash flow tracker (5 weeks)", "Expense log", "Income & invoice log", "Tax & savings set-aside by month", "Monthly profit summary and review", "Year overview: 12 months side by side"],
      STEPS,
    ) + "\n• For organizing your numbers only; not tax, legal or accounting advice.",
  },
  "family-command-center": {
    heroLine: "Everyone's schedule, meals and groceries, chores and appointments in one place.",
    heroPages: [3, 2, 4], detailPage: 3,
    detailPoints: ["Breakfast, lunch and dinner for 7 days", "Grocery list sorted by store section", "Build the list straight from the meal plan", "Fits on one fridge-ready page"],
    price: "6.99",
    title: "Family Planner Printable, Weekly Family Command Center, Meal Planner and Grocery List, Chore Chart, Undated Family Schedule PDF",
    tags: ["family planner", "command center", "meal planner", "grocery list", "chore chart", "family schedule", "mom planner", "weekly planner pdf", "household binder", "home organization", "undated planner", "kids chore chart", "family organizer"],
    description: etsyDescription(
      "Run the household from one place: everyone's week, meals and groceries, chores, appointments and the contacts you always need. Undated, so you can print it again every week.",
      ["Cover and how-to page", "Weekly family schedule (up to 6 people)", "Meal planner with grocery list by store section", "Weekly chore chart with reward notes", "Appointments & activities log", "Undated monthly calendar", "Important contacts with allergy and medical notes"],
      STEPS,
    ),
  },
  "service-business-planner": {
    heroLine: "Schedule jobs, track every lead and quote, chase invoices and get more reviews.",
    heroPages: [2, 3, 7], detailPage: 7,
    detailPoints: ["Leads, quotes, jobs and money in", "Where your leads came from", "Wins and problems to fix", "Supplies to reorder and next week's goals"],
    price: "6.99",
    title: "Service Business Planner Printable, Job Schedule, Lead Tracker, Quote and Invoice Tracker for Cleaning, Lawn Care, Contractors PDF",
    tags: ["business planner", "cleaning business", "lawn care business", "contractor planner", "lead tracker", "invoice tracker", "quote tracker", "job schedule", "small business", "client tracker", "handyman business", "weekly planner pdf", "service business"],
    description: etsyDescription(
      "For owners who run on jobs, like cleaners, landscapers, plumbers, electricians and handymen: schedule the week, catch every lead, follow up on quotes and get paid for every job.",
      ["Cover and how-to page", "Weekly job schedule with customer, address and crew", "Lead tracker for every call and message", "Quote & estimate tracker with two follow-ups", "Invoice & payment tracker", "Customer follow-up log for thank-yous, reviews and repeat service", "Week in numbers: leads, quotes, jobs, money in, lead sources"],
      STEPS,
    ),
  },
};

export const GUMROAD = {
  "local-service-business-prompts": {
    price: "12",
    summary: "30 fill-in-the-blank AI prompts that write your Google posts, review replies, quote follow-ups, website pages and repeat-business messages.",
  },
  "real-estate-agent-prompts": {
    price: "12",
    summary: "30 fill-in-the-blank AI prompts for listings, social posts, buyer and seller emails, video scripts and client conversations, with fair housing guardrails.",
  },
  "etsy-seller-prompts": {
    price: "12",
    summary: "30 fill-in-the-blank AI prompts for Etsy titles and all 13 tags, descriptions, photo shot lists, shop setup, buyer messages and Pinterest.",
  },
};

export function gumroadDescription(pk, n) {
  return [
    pk.tagline,
    "",
    "WHAT YOU GET",
    `• ${n} prompts in ${pk.sections.length} sections: ${pk.sections.map((s) => s.name).join(", ")}`,
    "• A starter context block you paste once, so every answer uses your business details and tone",
    "• Every prompt tells the AI to use only facts you give it and to ask when something is missing",
    "• PDF (easy to read) and TXT (easy to copy) versions",
    "",
    "WORKS WITH",
    "ChatGPT, Claude, Gemini or any AI chat assistant. No special tools or plugins.",
    "",
    "GOOD TO KNOW",
    "• Digital download. You get the files right after purchase.",
    "• AI output can be wrong: check facts, prices and claims before you publish.",
    "• For your own business use; please do not resell or share the files.",
    "• Written with the help of AI tools and reviewed by me.",
  ].join("\n");
}
