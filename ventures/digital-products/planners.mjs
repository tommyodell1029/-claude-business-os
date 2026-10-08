// The five printable planners for the Etsy validation experiment (owner, 2026-10-08: 5 Etsy listings, target
// 3 sales in 14 days). Niches come from the stored research evidence: niche planners (ADHD for college students,
// teacher, small business budget kit, parents) face far less competition than generic ones. All undated.
import { DAYS, MONTHS, box, checks, esc, header, lines, page, table } from "./lib.mjs";

const USE = "Personal use only";

function cover(p) {
  return page(`
  <div>
    <div class="band"></div>
    <div class="pill">Printable planner · Undated</div>
    <h1 style="margin-top:16pt">${esc(p.title)}</h1>
    <div class="sub">${esc(p.tagline)}</div>
  </div>
  <div>
    <div class="kicker" style="font:700 8pt Inter;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin-bottom:8pt">Inside</div>
    <ul>${p.pages.slice(1).map((x) => `<li>${esc(x.name)}</li>`).join("")}</ul>
  </div>
  <div class="note">Print as many copies as you need for your own use. Tip: print the weekly and daily pages double-sided and keep them in a binder or clipboard.</div>`, { cls: "cover", brand: USE, name: p.title });
}

function howTo(p) {
  return page(`
  ${header("How to use it", p.title)}
  <div class="prose">${p.howTo}</div>
  <div class="box tint grow">${'<div class="lbl">Notes</div>'}${lines(24)}</div>`, { brand: USE, name: p.title });
}

// ---------------------------------------------------------------- 1. ADHD daily planner for college students
const adhd = {
  slug: "adhd-college-planner",
  title: "ADHD-Friendly College Planner",
  tagline: "A low-overwhelm daily and weekly system for students: brain dump first, pick three things, block your time, and catch every due date.",
  palette: { accent: "#0f8b8d", tint: "#e3f4f3" },
  howTo: `<h2>Start with the brain dump</h2><p>When everything feels urgent, write it all down on the Brain Dump page before you plan. Getting it out of your head makes it easier to choose.</p>
<h2>Each week (10 minutes)</h2><ol><li>Fill in classes and due dates on the Weekly Reset.</li><li>Copy anything due this week from the Assignment Tracker.</li><li>Pick one main goal for the week.</li></ol>
<h2>Each day (5 minutes)</h2><ol><li>Choose your Top 3. If you only finish these, the day counts.</li><li>Block time for them, with breaks. Short focus blocks work for many people; start with 25 minutes.</li><li>At night, write one win. Small ones count.</li></ol>
<p class="note">This planner is an organizing tool, not medical advice or treatment.</p>`,
  pages: [],
};
adhd.pages = [
  { name: "Cover", html: () => cover(adhd) },
  { name: "How to use it", html: () => howTo(adhd) },
  { name: "Semester at a glance", html: () => page(`
    ${header("Semester at a glance", "Big dates in one place", ["Semester"])}
    <div class="row grow">${["Month 1", "Month 2", "Month 3", "Month 4"].map((m) => box(m, lines(20), { cls: "grow" })).join("")}</div>
    <div class="row" style="height:2.2in">${box("Exams & finals", lines(20), { cls: "grow" })}${box("Breaks & no-class days", lines(20), { cls: "grow" })}</div>`, { brand: USE, name: adhd.title }) },
  { name: "Weekly reset", html: () => page(`
    ${header("Weekly reset", "Plan the week in 10 minutes", ["Week of"])}
    <div class="row" style="height:1.2in">${box("One main goal this week", lines(22), { cls: "grow tint" })}${box("Due this week", checks(3), { cls: "grow" })}</div>
    <div class="row grow">${DAYS.slice(0, 4).map((d) => box(d, `<div class="note">Classes / due</div>${lines(20)}`, { cls: "grow" })).join("")}</div>
    <div class="row grow">${DAYS.slice(4).map((d) => box(d, `<div class="note">Classes / due</div>${lines(20)}`, { cls: "grow" })).join("")}${box("Self-care check", checks(5, { labels: ["Sleep plan", "Meals", "Movement", "Time with people", "Something fun"] }), { cls: "grow tint" })}</div>`, { brand: USE, name: adhd.title }) },
  { name: "Daily focus page", html: () => page(`
    ${header("Today", "Daily focus", ["Date"])}
    <div class="row" style="height:1.75in">${box("Top 3 (if I only do these, today counts)", checks(3, { circle: true }), { cls: "grow tint" })}${box("Due today / class", lines(20), { cls: "grow" })}</div>
    <div class="row grow">
      ${box("Time blocks", table([["Time", 22], ["Plan", 78]], 14, ["8 am", "9 am", "10 am", "11 am", "12 pm", "1 pm", "2 pm", "3 pm", "4 pm", "5 pm", "6 pm", "7 pm", "8 pm", "9 pm"]), { cls: "grow", style: "flex:1.5" })}
      <div class="col grow">
        ${box("Brain dump (park it here)", lines(20), { cls: "grow" })}
        ${box("Focus blocks done", `<div style="display:flex;gap:7pt;flex-wrap:wrap">${Array.from({ length: 8 }, () => '<i style="width:16pt;height:16pt;border:1pt solid var(--accent);border-radius:50%;display:inline-block"></i>').join("")}</div>`)}
        ${box("Water · meals · meds/vitamins", checks(3, { labels: ["", "", ""] }))}
      </div>
    </div>
    <div class="row" style="height:0.9in">${box("One win today", lines(22), { cls: "grow" })}${box("Tomorrow, first thing", lines(22), { cls: "grow" })}</div>`, { brand: USE, name: adhd.title }) },
  { name: "Assignment tracker", html: () => page(`
    ${header("Assignment tracker", "Every due date, one list", ["Class"])}
    ${box("Assignments", table([["Due", 12], ["Class", 16], ["Assignment", 40], ["Start by", 12], ["Done", 8], ["Grade", 12]], 24), { cls: "grow" })}`, { brand: USE, name: adhd.title }) },
  { name: "Exam prep planner", html: () => page(`
    ${header("Exam prep", "Break it into small steps", ["Exam", "Date"])}
    <div class="row" style="height:1.6in">${box("Topics covered", lines(20), { cls: "grow" })}${box("What I already know", lines(20), { cls: "grow" })}${box("What I need help with", lines(20), { cls: "grow" })}</div>
    ${box("Study plan (countdown)", table([["Days left", 14], ["Topic", 36], ["Method (flashcards, practice test…)", 38], ["Done", 12]], 12, ["7", "6", "5", "4", "3", "2", "1"]), { cls: "grow" })}
    <div class="row" style="height:1in">${box("Exam-day checklist", checks(3, { labels: ["Sleep, food, water", "ID, pens, calculator", "Room and time confirmed"] }), { cls: "grow tint" })}</div>`, { brand: USE, name: adhd.title }) },
  { name: "Brain dump", html: () => page(`
    ${header("Brain dump", "Empty your head, then sort", ["Date"])}
    ${box("Everything on my mind", lines(22), { cls: "grow" })}
    <div class="row" style="height:2.1in">${box("Do today", checks(5), { cls: "grow tint" })}${box("Schedule it", checks(5), { cls: "grow" })}${box("Let it go / later", checks(5), { cls: "grow" })}</div>`, { brand: USE, name: adhd.title }) },
];

// ---------------------------------------------------------------- 2. Teacher weekly lesson planner
const teacher = {
  slug: "teacher-lesson-planner",
  title: "Teacher Weekly Lesson Planner",
  tagline: "Undated weekly lesson plans for six periods or subjects, plus a year overview, parent contact log, grading tracker and a ready-to-fill substitute sheet.",
  palette: { accent: "#c8553d", tint: "#fbeae5" },
  howTo: `<h2>Set up once</h2><ol><li>Fill in the Year at a Glance with terms, breaks and testing windows.</li><li>Complete the Substitute Info sheet and keep a copy in your sub folder.</li></ol>
<h2>Every week</h2><ol><li>Print a Weekly Lesson Plan. Label your periods or subjects down the left side.</li><li>Use the Weekly Priorities box for meetings, duties and copies to make.</li><li>Log parent calls and emails as they happen so nothing is forgotten at conference time.</li></ol>
<h2>Grading</h2><p>List each assignment once on the Grading Tracker and tick classes off as you finish them.</p>`,
  pages: [],
};
teacher.pages = [
  { name: "Cover", html: () => cover(teacher) },
  { name: "How to use it", html: () => howTo(teacher) },
  { name: "Year at a glance", html: () => page(`
    ${header("Year at a glance", "Terms, breaks, testing", ["School year"])}
    <div class="row grow">${MONTHS.slice(7, 11).map((m) => box(m, lines(17), { cls: "grow" })).join("")}</div>
    <div class="row grow">${[MONTHS[11], ...MONTHS.slice(0, 3)].map((m) => box(m, lines(17), { cls: "grow" })).join("")}</div>
    <div class="row grow">${MONTHS.slice(3, 7).map((m) => box(m, lines(17), { cls: "grow" })).join("")}</div>`, { brand: USE, name: teacher.title }) },
  { name: "Weekly lesson plan", html: () => page(`
    ${header("Weekly lesson plan", "Plan the week", ["Week of", "Unit"])}
    <div class="row" style="height:1in">${box("Weekly priorities", lines(20), { cls: "grow tint" })}${box("Meetings & duties", lines(20), { cls: "grow" })}${box("Copies to make", checks(3), { cls: "grow" })}</div>
    ${box("Lessons", table([["Period / subject", 15], ["Monday", 17], ["Tuesday", 17], ["Wednesday", 17], ["Thursday", 17], ["Friday", 17]], 6, ["1", "2", "3", "4", "5", "6"]), { cls: "grow" })}`, { brand: USE, name: teacher.title }) },
  { name: "Daily plan", html: () => page(`
    ${header("Daily plan", "Today in class", ["Date"])}
    <div class="row grow">
      ${box("Schedule", table([["Time", 22], ["Class / activity", 78]], 12), { cls: "grow", style: "flex:1.4" })}
      <div class="col grow">${box("To do", checks(8), { cls: "grow tint" })}${box("Students to check in with", lines(20), { cls: "grow" })}${box("Reminders", lines(20), { cls: "grow" })}</div>
    </div>`, { brand: USE, name: teacher.title }) },
  { name: "Grading tracker", html: () => page(`
    ${header("Grading tracker", "Know what is left to grade", ["Term"])}
    ${box("Assignments", table([["Assignment", 30], ["Given", 11], ["Due", 11], ["Class 1", 8], ["Class 2", 8], ["Class 3", 8], ["Class 4", 8], ["Entered", 16]], 22), { cls: "grow" })}`, { brand: USE, name: teacher.title }) },
  { name: "Parent communication log", html: () => page(`
    ${header("Parent communication log", "Calls, emails, meetings", ["Term"])}
    ${box("Log", table([["Date", 11], ["Student", 17], ["Parent / guardian", 17], ["How", 10], ["Reason & notes", 33], ["Follow-up", 12]], 20), { cls: "grow" })}`, { brand: USE, name: teacher.title }) },
  { name: "Substitute info sheet", html: () => page(`
    ${header("Substitute info", "Everything a sub needs", ["Teacher", "Room"])}
    <div class="row grow">${box("Daily schedule", table([["Time", 25], ["Class / duty", 75]], 10), { cls: "grow" })}${box("Helpful students & staff", lines(20), { cls: "grow" })}</div>
    <div class="row grow">${box("Procedures (attendance, bathroom, dismissal)", lines(20), { cls: "grow" })}${box("Emergency plan & contacts", lines(20), { cls: "grow tint" })}</div>
    <div class="row" style="height:1.3in">${box("Where to find things", lines(20), { cls: "grow" })}${box("Notes for the sub", lines(20), { cls: "grow" })}</div>`, { brand: USE, name: teacher.title }) },
];

// ---------------------------------------------------------------- 3. Small business monthly budget kit
const budget = {
  slug: "small-business-budget-kit",
  title: "Small Business Monthly Budget Kit",
  tagline: "Plan the month, track every dollar in and out, set money aside for taxes, and see your real profit on one page. Built for solo owners and small teams.",
  palette: { accent: "#2f7d4f", tint: "#e6f3ea" },
  howTo: `<h2>At the start of each month</h2><ol><li>Fill in the Monthly Budget: expected income, fixed costs and planned spending.</li><li>Decide your tax set-aside percentage with your accountant and write it on the Tax & Savings page.</li></ol>
<h2>Every week</h2><ol><li>Record money in and money out on the Cash Flow Tracker.</li><li>Log expenses with receipts on the Expense Log and invoices on the Income & Invoice Log.</li></ol>
<h2>At month end</h2><p>Total everything on the Profit Summary, then copy the totals to the Year Overview to see trends.</p>
<p class="note">This kit is for organizing your numbers. It is not tax, legal or accounting advice.</p>`,
  pages: [],
};
budget.pages = [
  { name: "Cover", html: () => cover(budget) },
  { name: "How to use it", html: () => howTo(budget) },
  { name: "Monthly budget", html: () => page(`
    ${header("Monthly budget", "Plan the month", ["Month"])}
    <div class="row grow">
      ${box("Income", table([["Source", 52], ["Planned", 24], ["Actual", 24]], 9), { cls: "grow" })}
      ${box("Fixed costs", table([["Cost", 52], ["Planned", 24], ["Actual", 24]], 9, ["Rent", "Insurance", "Software", "Phone / internet", "Loan payment"]), { cls: "grow" })}
    </div>
    <div class="row grow">
      ${box("Variable costs", table([["Cost", 52], ["Planned", 24], ["Actual", 24]], 9, ["Supplies", "Fuel / travel", "Marketing", "Contractors", "Fees"]), { cls: "grow" })}
      <div class="col grow">${box("Totals", table([["", 52], ["Planned", 24], ["Actual", 24]], 4, ["Income", "Costs", "Profit", "Tax set-aside"]), { cls: "grow tint" })}${box("Notes", lines(20), { cls: "grow" })}</div>
    </div>`, { brand: USE, name: budget.title }) },
  { name: "Cash flow tracker", html: () => page(`
    ${header("Cash flow tracker", "Money in, money out, weekly", ["Month", "Starting balance"])}
    ${box("Weekly cash flow", table([["", 16], ["Week 1", 16.8], ["Week 2", 16.8], ["Week 3", 16.8], ["Week 4", 16.8], ["Week 5", 16.8]], 10, ["Starting cash", "Customer payments", "Other income", "Total in", "Fixed costs", "Variable costs", "Owner pay", "Tax set-aside", "Total out", "Ending cash"]), { cls: "grow" })}
    <div class="row" style="height:1.5in">${box("Unpaid invoices to chase", checks(4), { cls: "grow tint" })}${box("Big expenses coming up", checks(4), { cls: "grow" })}</div>`, { brand: USE, name: budget.title }) },
  { name: "Expense log", html: () => page(`
    ${header("Expense log", "Every purchase, with receipts", ["Month"])}
    ${box("Expenses", table([["Date", 11], ["Vendor", 20], ["What for", 29], ["Category", 15], ["Amount", 13], ["Receipt", 12]], 25), { cls: "grow" })}`, { brand: USE, name: budget.title }) },
  { name: "Income & invoice log", html: () => page(`
    ${header("Income & invoice log", "Who owes you, who paid", ["Month"])}
    ${box("Invoices and payments", table([["Invoice #", 11], ["Customer", 22], ["Sent", 11], ["Due", 11], ["Amount", 14], ["Paid on", 13], ["Method", 18]], 25), { cls: "grow" })}`, { brand: USE, name: budget.title }) },
  { name: "Tax & savings set-aside", html: () => page(`
    ${header("Tax & savings set-aside", "Pay yourself and the taxman", ["Year"])}
    <div class="row" style="height:1.1in">${box("My set-aside rate (ask your accountant)", lines(22), { cls: "grow tint" })}${box("Estimated tax due dates", lines(22), { cls: "grow" })}</div>
    ${box("Set-aside by month", table([["Month", 16], ["Profit", 17], ["Tax set aside", 17], ["Savings", 17], ["Tax paid", 17], ["Balance", 16]], 12, MONTHS), { cls: "grow" })}`, { brand: USE, name: budget.title }) },
  { name: "Monthly profit summary", html: () => page(`
    ${header("Profit summary", "How the month really went", ["Month"])}
    <div class="row" style="height:2.2in">${box("Totals", table([["", 55], ["Amount", 45]], 6, ["Total income", "Total costs", "Profit", "Profit margin %", "Tax set aside", "Owner pay"]), { cls: "grow tint" })}${box("Top 3 customers / jobs", checks(3), { cls: "grow" })}</div>
    <div class="row grow">${box("What went well", lines(22), { cls: "grow" })}${box("What to change next month", lines(22), { cls: "grow" })}</div>
    <div class="row grow">${box("Costs to cut or renegotiate", checks(5), { cls: "grow" })}${box("Goals for next month", checks(5), { cls: "grow" })}</div>`, { brand: USE, name: budget.title }) },
  { name: "Year overview", html: () => page(`
    ${header("Year overview", "Twelve months side by side", ["Year"])}
    ${box("Monthly totals", table([["Month", 16], ["Income", 17], ["Costs", 17], ["Profit", 17], ["Tax set aside", 17], ["Notes", 16]], 13, [...MONTHS, "Total"]), { cls: "grow" })}`, { brand: USE, name: budget.title }) },
];

// ---------------------------------------------------------------- 4. Family weekly command center
const family = {
  slug: "family-command-center",
  title: "Family Weekly Command Center",
  tagline: "Run the household from one place: everyone's schedule, meals and groceries, chores, appointments and important contacts. Undated and reusable.",
  palette: { accent: "#d17a22", tint: "#fdf0e1" },
  howTo: `<h2>Sunday reset (15 minutes)</h2><ol><li>Fill in the Weekly Family Schedule with each person's activities.</li><li>Plan dinners on the Meal Planner and build the grocery list from it.</li><li>Assign chores for the week on the Chore Chart.</li></ol>
<h2>Put it where everyone sees it</h2><p>Print the schedule and chore chart, and pin them on the fridge or a family board. Kids can tick off their own chores.</p>
<h2>Keep for reference</h2><p>Fill in Important Contacts once and keep it near the phone or in a sheet protector.</p>`,
  pages: [],
};
family.pages = [
  { name: "Cover", html: () => cover(family) },
  { name: "How to use it", html: () => howTo(family) },
  { name: "Weekly family schedule", html: () => page(`
    ${header("Weekly family schedule", "Who is where", ["Week of"])}
    ${box("Schedule", table([["Who", 14], ...DAYS.map((d) => [d.slice(0, 3), 12.28])], 6), { cls: "grow" })}
    <div class="row" style="height:1.8in">${box("This week's priorities", checks(4), { cls: "grow tint" })}${box("Appointments", lines(20), { cls: "grow" })}${box("Remember", lines(20), { cls: "grow" })}</div>`, { brand: USE, name: family.title }) },
  { name: "Meal planner & grocery list", html: () => page(`
    ${header("Meals & groceries", "Plan once, shop once", ["Week of"])}
    <div class="row grow">
      ${box("Meal plan", table([["Day", 16], ["Breakfast", 28], ["Lunch", 28], ["Dinner", 28]], 7, DAYS.map((d) => d.slice(0, 3))), { cls: "grow", style: "flex:1.6" })}
      <div class="col grow">${["Produce", "Dairy & eggs", "Meat & fish", "Pantry", "Other"].map((g) => box(g, checks(4), { cls: "grow" })).join("")}</div>
    </div>`, { brand: USE, name: family.title }) },
  { name: "Chore chart", html: () => page(`
    ${header("Chore chart", "Everyone helps", ["Week of"])}
    ${box("Chores", table([["Chore", 22], ["Who", 13], ...DAYS.map((d) => [d.slice(0, 3), 9.28])], 14), { cls: "grow" })}
    <div class="row" style="height:1.2in">${box("Reward / allowance", lines(22), { cls: "grow tint" })}${box("Notes", lines(22), { cls: "grow" })}</div>`, { brand: USE, name: family.title }) },
  { name: "Appointments & activities", html: () => page(`
    ${header("Appointments & activities", "Doctors, school, sports", ["Month"])}
    ${box("Upcoming", table([["Date", 11], ["Time", 9], ["Who", 13], ["What", 30], ["Where", 21], ["Bring / notes", 16]], 22), { cls: "grow" })}`, { brand: USE, name: family.title }) },
  { name: "Monthly calendar (undated)", html: () => page(`
    ${header("Month", "Fill in the dates", ["Month"])}
    <table class="t grow" style="height:100%"><tr>${DAYS.map((d) => `<th>${d.slice(0, 3)}</th>`).join("")}</tr>${Array.from({ length: 6 }, () => `<tr>${DAYS.map(() => '<td style="vertical-align:top;padding-top:3pt"><span style="display:inline-block;width:14pt;height:12pt;border-bottom:.75pt solid var(--rule)"></span></td>').join("")}</tr>`).join("")}</table>`, { brand: USE, name: family.title }) },
  { name: "Important contacts", html: () => page(`
    ${header("Important contacts", "Keep near the phone", [])}
    ${box("Contacts", table([["Name", 24], ["Role", 18], ["Phone", 20], ["Email / notes", 38]], 16, ["Doctor", "Dentist", "School", "Babysitter", "Neighbor", "Work", "Poison control", "Insurance"]), { cls: "grow" })}
    <div class="row" style="height:1.4in">${box("Allergies & medical notes", lines(20), { cls: "grow tint" })}${box("Wi-Fi, codes, other", lines(20), { cls: "grow" })}</div>`, { brand: USE, name: family.title }) },
];

// ---------------------------------------------------------------- 5. Service business weekly planner
const service = {
  slug: "service-business-planner",
  title: "Service Business Weekly Planner",
  tagline: "For plumbers, cleaners, landscapers, electricians and every owner who runs on jobs: schedule the week, track leads and quotes, chase invoices and follow up with customers.",
  palette: { accent: "#2b4c7e", tint: "#e6ecf5" },
  howTo: `<h2>Monday morning</h2><ol><li>Fill in the Weekly Job Schedule with crews or yourself and each job's address.</li><li>Check the Quote Tracker and call anyone who has not answered in three days.</li></ol>
<h2>Every day</h2><ol><li>Every new call or message goes on the Lead Tracker, even if you are too busy. Missed leads are lost money.</li><li>When a job is done, write the invoice on the Invoice & Payment Tracker the same day.</li></ol>
<h2>Friday</h2><p>Fill in the Week in Numbers: leads, quotes, jobs, money in. Over a few weeks you will see what is working.</p>`,
  pages: [],
};
service.pages = [
  { name: "Cover", html: () => cover(service) },
  { name: "How to use it", html: () => howTo(service) },
  { name: "Weekly job schedule", html: () => page(`
    ${header("Weekly job schedule", "Jobs, crews, addresses", ["Week of"])}
    ${box("Jobs", table([["Day", 12], ["Time", 10], ["Customer", 18], ["Address", 24], ["Job", 22], ["Crew", 14]], 21, ["Mon", "", "", "Tue", "", "", "Wed", "", "", "Thu", "", "", "Fri", "", "", "Sat", "", "", "Sun"]), { cls: "grow" })}`, { brand: USE, name: service.title }) },
  { name: "Lead tracker", html: () => page(`
    ${header("Lead tracker", "Every call and message", ["Week of"])}
    ${box("Leads", table([["Date", 10], ["Name", 17], ["Phone", 15], ["Job needed", 24], ["Source", 12], ["Next step", 14], ["Won?", 8]], 22), { cls: "grow" })}`, { brand: USE, name: service.title }) },
  { name: "Quote & estimate tracker", html: () => page(`
    ${header("Quote tracker", "Follow up until yes or no", ["Month"])}
    ${box("Quotes", table([["Sent", 10], ["Customer", 18], ["Job", 24], ["Amount", 12], ["Follow-up 1", 12], ["Follow-up 2", 12], ["Result", 12]], 22), { cls: "grow" })}`, { brand: USE, name: service.title }) },
  { name: "Invoice & payment tracker", html: () => page(`
    ${header("Invoices & payments", "Get paid for every job", ["Month"])}
    ${box("Invoices", table([["Invoice #", 11], ["Customer", 20], ["Job date", 11], ["Amount", 12], ["Sent", 11], ["Due", 11], ["Paid", 11], ["Method", 13]], 22), { cls: "grow" })}`, { brand: USE, name: service.title }) },
  { name: "Customer follow-up log", html: () => page(`
    ${header("Customer follow-ups", "Reviews, referrals, repeat work", ["Month"])}
    ${box("Follow-ups", table([["Customer", 20], ["Job done", 12], ["Thank-you", 11], ["Review asked", 12], ["Review left", 11], ["Next service due", 16], ["Notes", 18]], 20), { cls: "grow" })}`, { brand: USE, name: service.title }) },
  { name: "Week in numbers", html: () => page(`
    ${header("Week in numbers", "What is working", ["Week of"])}
    <div class="row" style="height:2.6in">${box("This week", table([["", 60], ["Count / $", 40]], 7, ["New leads", "Quotes sent", "Quotes won", "Jobs done", "Invoiced", "Collected", "Reviews received"]), { cls: "grow tint" })}${box("Where leads came from", table([["Source", 60], ["Leads", 40]], 7, ["Google", "Referral", "Repeat customer", "Facebook / Nextdoor", "Yard sign / truck", "Other", ""]), { cls: "grow" })}</div>
    <div class="row grow">${box("Wins", lines(22), { cls: "grow" })}${box("Problems to fix", lines(22), { cls: "grow" })}</div>
    <div class="row" style="height:1.6in">${box("Supplies to reorder", checks(5), { cls: "grow" })}${box("Goals for next week", checks(5), { cls: "grow" })}</div>`, { brand: USE, name: service.title }) },
];

export const PLANNERS = [adhd, teacher, budget, family, service];
