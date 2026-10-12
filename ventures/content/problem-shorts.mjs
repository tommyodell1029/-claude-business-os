// Problem-first Shorts (owner rule, 2026-10-12): every product becomes several narrow problem-solving Shorts.
// Structure: lead with ONE specific problem -> show a quick output or before/after -> point to the matching
// Linktree button. Each entry: video name, Kling video prompt (story format, 15 s, 9:16), the real output or
// planner page shown in the edit, title, caption, hashtags. Example outputs use made-up details and are labelled.
// Build the downloadable guide: node ventures/content/problem-shorts.mjs  -> out/problem-shorts.{md,pdf}
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const STYLE = "Vertical 3D animated cartoon short in a warm, polished Pixar-style look: soft lighting, expressive rounded characters, clean colors. Three shots, same characters throughout, clear lip-synced English dialogue, light comedic tone.";
const END = "No on-screen text, no logos, no subtitles.";
const kling = (s1, s2, s3) => `${STYLE}\n\nShot 1 (0-5s): ${s1}\n\nShot 2 (5-10s): ${s2}\n\nShot 3 (10-15s): ${s3}\n\n${END}`;

const L = {
  svc: "Prompts for Service Businesses ($12)",
  re: "Prompts for Real Estate Agents ($12)",
  etsy: "Prompts for Etsy Sellers ($12)",
  kit: "AI Side Hustle Starter Kit ($12)",
  plan: "Printable Planners (Etsy)",
};

export const SHORTS = [
  // ---------------------------------------------------------------- Service business prompts
  { product: "Local Service Business Prompt Pack", link: L.svc,
    name: "S01 · Reply to a 1-star review without sounding defensive",
    video: kling(
      "A tired HVAC business owner in a work polo at a small office desk reads his phone and winces. He says to camera, frustrated: \"A one-star review... and I want to fire back so bad.\"",
      "His office manager rolls her chair over holding a tablet with a short reply on screen. She says calmly: \"Paste it into this prompt. Calm, honest, and it invites them to call.\"",
      "Same office, he taps send and leans back relieved. He says: \"Okay. That actually sounds professional.\""),
    output: "Example AI output (made-up details): \"Hi Karen, you're right that our tech arrived two hours late, and we should have called to tell you. That's on us, and I'm sorry. He was held up at an emergency job, but you deserved a heads-up. I'd like to make this right. Please call me, Lisa, at our office so we can sort it out.\"",
    title: "Reply to a 1-star review without sounding defensive",
    caption: "That 1-star review stings. Don't fire back. Paste it into this prompt and get a calm, honest public reply that owns what's fair and invites them to call you. One of 30 prompts in my service business pack. Link in bio → Prompts for Service Businesses.",
    tags: "#smallbusiness #googlereviews #customerservice #contractor #chatgptprompts" },
  { product: "Local Service Business Prompt Pack", link: L.svc,
    name: "S02 · Missed a call? Text them back before they call your competitor",
    video: kling(
      "A plumber under a sink, phone buzzing on the floor next to him with a missed call. He looks at it and says to camera, stressed: \"Missed another call. They're already calling someone else.\"",
      "His partner crouches down holding a phone with a short text on screen. She says warmly: \"This prompt writes the text-back. It goes out the second you miss a call.\"",
      "Later, he's wiping his hands and reading a reply on his phone, smiling. He says: \"They texted back. Booked for Thursday.\""),
    output: "Example AI output (made-up details): \"Hi, this is Coastal Plumbing. Sorry we missed you! We're on a job and will call you back within 30 minutes. What can we help with today?\"",
    title: "Missed a call? Text them back before they call someone else",
    caption: "Every missed call can be a lost job. This prompt writes the automatic text-back: who you are, when you'll call back, and what they need. Three versions in seconds. Link in bio → Prompts for Service Businesses.",
    tags: "#plumber #contractor #smallbusinesstips #leadgeneration #chatgptprompts" },
  { product: "Local Service Business Prompt Pack", link: L.svc,
    name: "S03 · Follow up on a quote without sounding pushy",
    video: kling(
      "A landscaper sitting in his truck, scrolling a list of sent quotes on his phone. He says to camera, unsure: \"Sent the quote a week ago. Do I follow up or is that pushy?\"",
      "His crew member leans in the passenger window holding a phone. He says, helpful: \"There's a prompt for that. Three follow-ups. No pressure, no fake deadlines.\"",
      "Same truck, he sends a message and nods, confident. He says: \"Friendly check-in sent. Done.\""),
    output: "Example AI output (made-up details): Day 2 text: \"Hi Mark, it's Sam from Green Edge. Just making sure the quote came through. Happy to answer any questions!\" · Day 10 text: \"Hi Mark, last check on the patio quote. No worries if the timing's not right; it's valid until the 30th.\"",
    title: "Follow up on a quote without sounding pushy",
    caption: "Sent a quote and heard nothing? This prompt writes 3 short follow-ups (day 2, day 5, day 10). Friendly, no pressure tactics, no fake deadlines. Link in bio → Prompts for Service Businesses.",
    tags: "#lawncare #contractor #salestips #smallbusiness #chatgptprompts" },
  // ---------------------------------------------------------------- Real estate prompts
  { product: "Real Estate Agent Prompt Pack", link: L.re,
    name: "S04 · An MLS description that sticks to the facts",
    video: kling(
      "A real estate agent in a blazer stares at a blank laptop screen in a staged living room. She says to camera, stuck: \"Every listing I write sounds exactly the same.\"",
      "Her colleague leans over the couch holding a tablet with a short paragraph. He says warmly: \"Give AI only your facts. It leads with the best real feature.\"",
      "Same room, she reads her screen and smiles. She says: \"That actually sounds like this house.\""),
    output: "Example AI output (made-up details): \"A new roof in 2023 and a quartz-counter kitchen update set this 3-bed, 2-bath, 1,640 sq ft home apart. Relax on the screened porch, enjoy the fenced 0.24-acre yard, and skip the HOA fees. Built 1998.\"",
    title: "An MLS description that sticks to the facts",
    caption: "Agents: give AI your facts only and let it lead with the strongest real feature. No made-up upgrades, fair-housing friendly, under 500 characters. Link in bio → Prompts for Real Estate Agents.",
    tags: "#realestateagent #realtor #mlslisting #realestatetips #chatgptprompts" },
  { product: "Real Estate Agent Prompt Pack", link: L.re,
    name: "S05 · Check your listing for fair housing red flags",
    video: kling(
      "An agent at a kitchen island reading her listing draft on a laptop, frowning. She says to camera, worried: \"Wait... can I even say 'perfect for families'?\"",
      "Her broker sits down beside her pointing at the screen. He says calmly: \"Run it through the compliance prompt. It flags the risky lines and rewrites them.\"",
      "Same kitchen, she clicks and relaxes. She says: \"Fixed before it ever went live.\""),
    output: "Example AI output (made-up details): Issue: \"perfect for families\" describes who should live there (familial status). Rewrite: \"three bedrooms and a fenced backyard.\" Issue: \"walking distance to church\" can signal religion. Rewrite: \"0.4 miles to Main Street shops.\"",
    title: "Check your listing for fair housing red flags",
    caption: "\"Perfect for families\" can get you in trouble. This prompt reviews your listing for fair housing problems and exaggerations, explains each one and rewrites it. Always have your broker check too. Link in bio → Prompts for Real Estate Agents.",
    tags: "#fairhousing #realestateagent #realtortips #listingdescription #chatgptprompts" },
  { product: "Real Estate Agent Prompt Pack", link: L.re,
    name: "S06 · Explain a low offer to your seller without the awkward silence",
    video: kling(
      "An agent in her car outside a house, phone in hand, rehearsing. She says to camera, nervous: \"How do I tell them the offer came in thirty thousand under?\"",
      "Her teammate in the passenger seat shows her a phone with bullet points. He says warmly: \"Calm talking points from the comps, plus three ways to respond.\"",
      "At the sellers' kitchen table, she speaks confidently, the sellers nodding. She says: \"So here are your three options.\""),
    output: "Example AI output (made-up details): Talking points: 3 recent sales nearby closed at $392k–$405k; the buyer flagged the 2009 AC. Options: 1) counter at $409k, 2) accept and offer a $3k AC credit, 3) hold and wait for the weekend showings.",
    title: "Explain a low offer to your seller without the awkward silence",
    caption: "The offer came in low and you have to call your sellers. This prompt turns your comps and buyer notes into calm talking points plus 3 response options. Link in bio → Prompts for Real Estate Agents.",
    tags: "#realestateagent #listingagent #realtorlife #realestatetips #chatgptprompts" },
  // ---------------------------------------------------------------- Etsy seller prompts
  { product: "Etsy Seller Prompt Pack", link: L.etsy,
    name: "S07 · A prompt that writes an Etsy title in 10 seconds",
    video: kling(
      "A crafter at a cluttered table surrounded by candles, typing and deleting on a laptop. She says to camera, frustrated: \"I've rewritten this Etsy title six times.\"",
      "Her sister leans over the table holding a phone with a short list. She says warmly: \"Paste in what it is and who it's for. You get five titles.\"",
      "Same table, now tidy, she clicks publish and smiles. She says: \"Listing's up. Next one!\""),
    output: "Example AI output (made-up details): \"Lavender Soy Candle 8 oz, Hand-Poured Relaxing Gift for Her, Cotton Wick Spa Candle in Amber Jar\"",
    title: "A prompt that writes an Etsy title in 10 seconds",
    caption: "Stuck on your Etsy title? This prompt writes 5 titles that put what it is in the first 40 characters, read naturally and use only true features. Link in bio → Prompts for Etsy Sellers.",
    tags: "#etsyseller #etsytips #etsyseo #etsyshop #chatgptprompts" },
  { product: "Etsy Seller Prompt Pack", link: L.etsy,
    name: "S08 · All 13 Etsy tags in one go",
    video: kling(
      "An Etsy seller in a sunny craft room counting on her fingers in front of a laptop. She says to camera, overwhelmed: \"Thirteen tags?! I never know what to write.\"",
      "Her friend sits beside her with a tablet showing a short list. She says warmly: \"One prompt. All thirteen, each under twenty characters.\"",
      "Same room, she claps once, pleased. She says: \"Done. On to the next one!\""),
    output: "Example AI output (made-up details): teacher planner, lesson plan template, lesson planner, teacher printable, undated planner, grading tracker, parent contact log, substitute binder, sub plans, teacher binder, weekly planner pdf, classroom planner, teacher gift",
    title: "All 13 Etsy tags in one go",
    caption: "Never know what to put in your 13 Etsy tags? One prompt gives you all 13, each under 20 characters, mixing what it is, who it's for and when it's used. Link in bio → Prompts for Etsy Sellers.",
    tags: "#etsyseller #etsytags #etsyseo #etsytips #chatgptprompts" },
  { product: "Etsy Seller Prompt Pack", link: L.etsy,
    name: "S09 · Answer 'where's my download?' messages in one tap",
    video: kling(
      "A digital-product seller on the couch at night, phone lighting up with message notifications. She says to camera, tired: \"Another buyer can't find their download.\"",
      "Her roommate leans over with a phone showing a short friendly reply. She says warmly: \"Save this reply once. Exact steps, friendly, done.\"",
      "Same couch, she sends it and gets a thumbs-up reply. She says: \"Found it. Happy customer.\""),
    output: "Example AI output (made-up details): \"Hi Jess! So sorry for the trouble. On Etsy, tap You > Purchases and reviews, find this order and tap Download files. On a phone it can be easier in a web browser. If it still doesn't show, reply here and I'll send it right over!\"",
    title: "Answer 'where's my download?' messages in one tap",
    caption: "Selling digital downloads? Buyers WILL ask where their file is. This prompt writes a friendly reply with the exact steps. Save it once, answer in seconds. Link in bio → Prompts for Etsy Sellers.",
    tags: "#etsyseller #digitalproducts #etsyshop #customerservice #chatgptprompts" },
  // ---------------------------------------------------------------- AI Side Hustle Starter Kit
  { product: "AI Side Hustle Starter Kit", link: L.kit,
    name: "S10 · Turn what you already know into 15 product ideas",
    video: kling(
      "A young man in a hoodie on his bed staring at the ceiling, laptop beside him. He says to camera, stuck: \"I want a side project, but I have no idea what to make.\"",
      "His friend sits on the edge of the bed holding a phone with a list. She says warmly: \"Paste your skills into this prompt. It lists products you can make this weekend.\"",
      "Same room, he's typing with a notebook full of ideas. He says: \"Okay. I've actually got options now.\""),
    output: "Example AI output (made-up details, for a former teacher who likes organizing): 1) Classroom sub-plan binder printable · 2) Back-to-school family checklist · 3) Homework tracker for parents · 4) Tutoring session log template · 5) Lesson-plan prompt pack for new teachers…",
    title: "Turn what you already know into 15 product ideas",
    caption: "Don't know what to make? Paste your skills and interests into this prompt and get 15 small digital product ideas you could make in a weekend, with who each is for. No income promises, just the process. Free version: link in bio → Free AI Tools List. Full kit: AI Side Hustle Starter Kit.",
    tags: "#sidehustle #digitalproducts #aitools #chatgptprompts #productideas" },
  { product: "AI Side Hustle Starter Kit", link: L.kit,
    name: "S11 · Price your first digital product without guessing",
    video: kling(
      "A woman at a café table with a laptop, chewing a pen. She says to camera, unsure: \"Is it three dollars? Fifteen? I have no idea what to charge.\"",
      "Her friend slides into the seat across holding a notepad of prices. She says warmly: \"Write down what similar ones cost. This prompt picks a launch price from that.\"",
      "Same café, she types a price and smiles. She says: \"Priced it. And I know why.\""),
    output: "Example AI output (made-up details): \"You found 8 similar planners at $3.50–$9.00, most around $5–$7. Launch at $6.50: in the middle of the range, room for a bundle later. Check 5 more listings before you lock it in.\"",
    title: "Price your first digital product without guessing",
    caption: "Stop guessing your price. Write down what similar products cost, paste the prices into this prompt, and it suggests a launch price with the reason. It only uses your numbers. Link in bio → AI Side Hustle Starter Kit.",
    tags: "#digitalproducts #etsytips #sidehustle #pricingstrategy #chatgptprompts" },
  { product: "AI Side Hustle Starter Kit", link: L.kit,
    name: "S12 · Write a 15-second video for your product",
    video: kling(
      "A young woman holding her phone up to film herself, then lowering it, embarrassed. She says to camera: \"I hate filming myself. What would I even say?\"",
      "Her roommate leans in with a tablet showing three short lines. She says warmly: \"This prompt writes a three-beat story video. Problem, friend, after.\"",
      "Same living room, she watches her finished animated video on the phone and grins. She says: \"That's my first video. And it's not cringe.\""),
    output: "Example AI output (made-up details): Beat 1: \"Sunday night and no meal plan again?\" · Beat 2: \"Put the whole week on one page and stick it on the fridge.\" · Beat 3: \"Grocery list's done. Dinner's handled.\"",
    title: "Write a 15-second video for your product (no camera)",
    caption: "Hate filming yourself? This prompt writes a 15-second, 3-beat story video for your product: the problem, the friend with the fix, the after. Label AI videos as AI. Link in bio → AI Side Hustle Starter Kit.",
    tags: "#contentcreation #facelesscontent #sidehustle #aitools #chatgptprompts" },
  // ---------------------------------------------------------------- Teacher planner
  { product: "Teacher Weekly Lesson Planner", link: L.plan,
    name: "S13 · Sub plans ready before you wake up sick",
    video: kling(
      "A teacher in pajamas at 5:40 AM, wrapped in a blanket, sneezing, phone in hand. She says to camera, panicked: \"I'm sick and my sub plans are... nowhere.\"",
      "Her partner hands her a binder open to a neat printed sub sheet. He says warmly: \"Your sub sheet. Filled in last month, remember?\"",
      "She's back in bed with tea, texting a photo of the sheet. She says, relieved: \"Sent to the office. Going back to sleep.\""),
    output: "Show in edit: the real Substitute Info Sheet page (page 8) with the label \"After: one page, ready to go\".",
    title: "Sub plans ready before you wake up sick",
    caption: "5:40 AM, sick, no sub plans? Fill in one sub sheet now (schedule, duties, helpful students, where things are) and it's ready on the worst morning. Part of an undated printable teacher planner. Link in bio → Printable Planners (Etsy).",
    tags: "#teachersoftiktok #subplans #teacherlife #teacherplanner #printables" },
  { product: "Teacher Weekly Lesson Planner", link: L.plan,
    name: "S14 · Stop losing track of parent calls",
    video: kling(
      "A teacher at her desk after school, sticky notes everywhere, phone to her ear. She says to camera, flustered: \"Did I call Jordan's mom back... or not?\"",
      "A teacher friend leans in the doorway holding a printed log page. She says warmly: \"Write every call on one page. Date, who, what you said.\"",
      "Same desk, now tidy, she checks a box on the log and smiles. She says: \"Called back. Logged. Done.\""),
    output: "Show in edit: the real Parent Communication Log page (page 7).",
    title: "Stop losing track of parent calls",
    caption: "Did you call that parent back? One page logs every call and email: date, who, what was said, follow-up. It's in the undated teacher planner. Link in bio → Printable Planners (Etsy).",
    tags: "#teachersoftiktok #teacherorganization #parentcommunication #teacherplanner #printables" },
  { product: "Teacher Weekly Lesson Planner", link: L.plan,
    name: "S15 · Your whole teaching week on one page",
    video: kling(
      "Sunday night, a teacher on the couch surrounded by papers and a laptop with too many tabs. She says to camera, overwhelmed: \"It's Sunday night and I haven't planned a single lesson.\"",
      "Her roommate sits down and hands her one printed weekly page. She says warmly: \"Six periods, Monday to Friday, all on one page.\"",
      "Same couch, papers gone, she holds the filled-in page proudly. She says: \"Ready for the week. Even the copies.\""),
    output: "Show in edit: the real Weekly Lesson Plan page (page 4).",
    title: "Your whole teaching week on one page",
    caption: "Sunday-night planning panic? Six periods, Mon–Fri, meetings, duties and copies to make, all on one page. Undated, so print it every week. Link in bio → Printable Planners (Etsy).",
    tags: "#teachersoftiktok #lessonplanning #teacherplanner #sundayreset #printables" },
  // ---------------------------------------------------------------- College planner
  { product: "ADHD-Friendly College Planner", link: L.plan,
    name: "S16 · Every due date in one place before midterms",
    video: kling(
      "A college student in a dorm, laptop open to five different course pages, hands in hair. He says to camera, stressed: \"Three classes, three portals, and I keep missing due dates.\"",
      "His roommate tosses him a printed tracker page from the top bunk. He says warmly: \"Write every due date on one sheet. Check them off.\"",
      "Same dorm, the sheet is taped above his desk, half the boxes checked. He says: \"Nothing sneaks up on me now.\""),
    output: "Show in edit: the real Assignment Tracker page (page 6).",
    title: "Every due date in one place before midterms",
    caption: "Three classes, three portals, missed deadlines? Put every assignment and due date on one page and check them off. Undated printable college planner. Link in bio → Printable Planners (Etsy).",
    tags: "#studytok #collegelife #studentplanner #adhdplanner #printables" },
  { product: "ADHD-Friendly College Planner", link: L.plan,
    name: "S17 · Brain has 40 tabs open? Dump them here first",
    video: kling(
      "A student at a desk with thought bubbles of tiny floating icons spinning around her head. She says to camera, frazzled: \"My brain has forty tabs open right now.\"",
      "Her friend sits beside her and slides over a printed page and a pen. She says warmly: \"Dump everything on this page. Then pick just three.\"",
      "Same desk, the floating icons are gone, she circles three items, calm. She says: \"Okay. Three things. I can do three things.\""),
    output: "Show in edit: the real Brain Dump page (page 8), then the Daily Focus page (page 5).",
    title: "Brain has 40 tabs open? Dump them here first",
    caption: "Too much in your head to start anything? Brain dump everything on one page, then pick just 3. Simple pages built for brains with too many tabs open. Link in bio → Printable Planners (Etsy).",
    tags: "#adhdtok #studytok #braindump #adhdplanner #printables" },
  { product: "ADHD-Friendly College Planner", link: L.plan,
    name: "S18 · Study for exams without cramming the night before",
    video: kling(
      "Late night in a library, a student surrounded by energy drinks and textbooks. He says to camera, exhausted: \"The exam's tomorrow and I started tonight. Again.\"",
      "A classmate sits down and shows him a printed exam prep plan with days filled in. She says warmly: \"Count back from the exam. A little each day.\"",
      "Daytime, same library, he's calm with a neat plan and one textbook. He says: \"Day three of five. No all-nighter.\""),
    output: "Show in edit: the real Exam Prep Planner page (page 7).",
    title: "Study for exams without cramming the night before",
    caption: "Starting the night before, again? Count back from the exam date and plan a little each day on one page. Part of an undated printable college planner. Link in bio → Printable Planners (Etsy).",
    tags: "#studytok #examprep #collegelife #studentplanner #printables" },
  // ---------------------------------------------------------------- Family command center
  { product: "Family Weekly Command Center", link: L.plan,
    name: "S19 · The planner that stops the 'what's for dinner?' text chain",
    video: kling(
      "A mom in a busy kitchen, phone buzzing nonstop with message bubbles floating up. She says to camera, exasperated: \"Fifteen texts asking what's for dinner. Fifteen.\"",
      "Her teenage son points at a printed meal plan stuck on the fridge. He says, sheepish: \"Wait... it's literally on the fridge.\"",
      "Same kitchen, calm, the family eating together, the meal plan on the fridge behind them. She says, smiling: \"Taco Tuesday. As planned.\""),
    output: "Show in edit: the real Meal Planner & Grocery List page (page 4).",
    title: "The one-page planner that stops the 'what's for dinner?' text chain",
    caption: "If your family group chat is 90% \"what's for dinner?\", put the week's meals and the grocery list on one page on the fridge. Undated printable. Link in bio → Printable Planners (Etsy).",
    tags: "#momlife #mealplanning #familyplanner #homeorganization #printables" },
  { product: "Family Weekly Command Center", link: L.plan,
    name: "S20 · Stop arguing about whose turn it is",
    video: kling(
      "Two kids argue in front of a full sink while a dad covers his ears. A kid says to camera, indignant: \"It's NOT my turn to do the dishes!\"",
      "The dad taps a printed chore chart on the fridge with names and checkboxes. He says calmly: \"The chart says Tuesday is you, buddy.\"",
      "Same kitchen, the kid is drying dishes, shrugging with a small smile. He says: \"Fine. The chart wins.\""),
    output: "Show in edit: the real Chore Chart page (page 5).",
    title: "Stop arguing about whose turn it is",
    caption: "\"It's not my turn!\" Put the week's chores, names and checkboxes on one page and let the chart decide. Undated printable family planner. Link in bio → Printable Planners (Etsy).",
    tags: "#momlife #chorechart #parentinghacks #familyplanner #printables" },
  { product: "Family Weekly Command Center", link: L.plan,
    name: "S21 · Who has practice tonight? Check the fridge",
    video: kling(
      "A dad at the front door with car keys, two kids in sports uniforms behind him. He says to camera, confused: \"Wait, is soccer tonight or Thursday?\"",
      "His daughter points at a printed weekly schedule on the fridge. She says, matter-of-fact: \"Tonight. Six o'clock. It's on the fridge, Dad.\"",
      "In the car, everyone buckled in, he gives a thumbs up. He says: \"On time. For once.\""),
    output: "Show in edit: the real Weekly Family Schedule page (page 3).",
    title: "Who has practice tonight? Check the fridge",
    caption: "Practice, appointments, who's driving: the whole family week on one page for the fridge. No more guessing. Undated printable. Link in bio → Printable Planners (Etsy).",
    tags: "#familyplanner #momlife #dadlife #homeorganization #printables" },
  // ---------------------------------------------------------------- Small business budget kit
  { product: "Small Business Monthly Budget Kit", link: L.plan,
    name: "S22 · Set aside tax money before it disappears",
    video: kling(
      "A bakery owner behind the counter staring at a tax notice, flour on her apron. She says to camera, shocked: \"I owe how much in taxes?!\"",
      "Her friend at the counter slides over a printed page with a simple set-aside table. She says warmly: \"Set a little aside every time money comes in. One page.\"",
      "Months later, same counter, she calmly hands over an envelope, relaxed. She says: \"Already saved for it.\""),
    output: "Show in edit: the real Tax & Savings Set-Aside page (page 7). Note: the page is a tracker, not tax advice.",
    title: "Set aside tax money before it disappears",
    caption: "Surprise tax bill? Track a set-aside every time money comes in, on one page. A printable budget kit for small businesses (a tracker, not tax advice). Link in bio → Printable Planners (Etsy).",
    tags: "#smallbusinessowner #taxtips #budgeting #bookkeeping #printables" },
  { product: "Small Business Monthly Budget Kit", link: L.plan,
    name: "S23 · Did you actually make a profit this month?",
    video: kling(
      "A craft-fair seller packing up her booth, counting cash and receipts. She says to camera, unsure: \"Busy month... but did I actually make anything?\"",
      "Her friend helping pack holds up a printed one-page summary. She says warmly: \"Money in, money out, profit. One page at the end of the month.\"",
      "At home, she fills in the last line of the page and nods. She says: \"Now I actually know.\""),
    output: "Show in edit: the real Monthly Profit Summary page (page 8).",
    title: "Did you actually make a profit this month?",
    caption: "Busy doesn't always mean profitable. Money in, money out and real profit on one page at the end of each month. Printable small business budget kit. Link in bio → Printable Planners (Etsy).",
    tags: "#smallbusiness #smallbusinessowner #budgeting #profit #printables" },
  { product: "Small Business Monthly Budget Kit", link: L.plan,
    name: "S24 · Know exactly who still owes you money",
    video: kling(
      "A freelance photographer scrolling through emails at a desk, squinting. He says to camera, confused: \"Did the Hendersons ever pay that invoice?\"",
      "His partner hands him a printed log with paid and unpaid columns. She says warmly: \"Every invoice on one page. Paid gets a check.\"",
      "Same desk, he circles one unpaid line and sends a polite reminder. He says: \"One reminder sent. Everyone else paid.\""),
    output: "Show in edit: the real Income & Invoice Log page (page 6).",
    title: "Know exactly who still owes you money",
    caption: "Lost track of unpaid invoices? Log every invoice on one page and tick it off when it's paid. Printable small business budget kit. Link in bio → Printable Planners (Etsy).",
    tags: "#freelancer #smallbusiness #invoicing #bookkeeping #printables" },
  // ---------------------------------------------------------------- Service business planner
  { product: "Service Business Weekly Planner", link: L.plan,
    name: "S25 · Stop losing leads from missed calls",
    video: kling(
      "A house cleaner in her car between jobs, scrolling missed calls and voicemails. She says to camera, stressed: \"I lost another lead. I can't keep track of all these calls.\"",
      "Her coworker in the passenger seat holds up a clipboard with a printed lead tracker. She says warmly: \"Write every call on one sheet. Name, number, what they need.\"",
      "Same car, she checks off a callback on the sheet and smiles. She says: \"Called back. New client Thursday.\""),
    output: "Show in edit: the real Lead Tracker page (page 4).",
    title: "Stop losing leads from missed calls",
    caption: "Cleaning, lawn care or contracting? Write every call on one sheet (name, number, what they need, called back?) so no lead slips. Printable service business planner. Link in bio → Printable Planners (Etsy).",
    tags: "#cleaningbusiness #lawncare #contractor #smallbusiness #printables" },
  { product: "Service Business Weekly Planner", link: L.plan,
    name: "S26 · Quotes sent, but nobody followed up",
    video: kling(
      "A painter at a job site, phone in hand, scrolling sent estimates. He says to camera, annoyed: \"I sent six quotes last week and forgot to follow up on all of them.\"",
      "His helper on a ladder points at a printed quote tracker taped to the van door. He says warmly: \"Write each quote down with a follow-up date.\"",
      "Same site, he dials a number from the sheet, smiling. He says: \"Hi! Just following up on that quote.\""),
    output: "Show in edit: the real Quote & Estimate Tracker page (page 5).",
    title: "Quotes sent, but nobody followed up?",
    caption: "Quotes don't close themselves. Track every quote with a follow-up date on one page. Printable service business planner. Link in bio → Printable Planners (Etsy).",
    tags: "#contractor #painting #smallbusiness #salestips #printables" },
  { product: "Service Business Weekly Planner", link: L.plan,
    name: "S27 · Your week in numbers on one page",
    video: kling(
      "A lawn care owner on his porch Friday evening, tired, staring at his phone. He says to camera, unsure: \"Long week. But was it a good week?\"",
      "His wife sits beside him with a printed one-page summary and a pen. She says warmly: \"Jobs done, quotes sent, money in. Fill it in Friday.\"",
      "Same porch, he finishes the page and nods, satisfied. He says: \"Now I know what to fix next week.\""),
    output: "Show in edit: the real Week in Numbers page (page 8).",
    title: "Your week in numbers on one page",
    caption: "Busy week, but was it a good one? Jobs done, quotes sent, money in, follow-ups, all on one page every Friday. Printable service business planner. Link in bio → Printable Planners (Etsy).",
    tags: "#lawncare #cleaningbusiness #smallbusinessowner #contractor #printables" },
];

// ---------------------------------------------------------------- build the guide (Markdown + PDF)
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const intro = `# Problem-First Shorts: 27 video briefs

Every product is split into narrow problem-solving Shorts. Each one leads with ONE specific problem, shows a quick output or before-and-after, then points to the matching Linktree button.

**How each video is made**
1. **Video prompt:** paste it into Higgsfield → Kling 3 (pro, sound on, 15 s, 9:16). It costs 37.5 credits, so check the balance first. Or send it to Claude to generate.
2. **Output shown:** the real prompt result or real planner page, added in the edit as a 3–4 s card before the end card (Claude adds both with the build script).
3. **End card:** the product + "Link in bio → <Linktree button name>".
4. **Post:** the same video on TikTok, Reels and Shorts. Turn on each app's AI label ("Animated dramatization · AI-generated" is on the video).

**Rules:** one problem per video. No income or sales claims. Example outputs use made-up details and say so. Reply to every comment.
`;
const md = [intro, ...SHORTS.map((s) => `---

## ${s.name}
**Product:** ${s.product} · **Linktree button:** ${s.link}

**Video Name:** ${s.name}

**Video Prompt:**
\`\`\`
${s.video}
\`\`\`
**Output shown (added in edit):** ${s.output}

**Title:** ${s.title}

**Caption:** ${s.caption}

**Hashtags:** ${s.tags}
`)].join("\n");
writeFileSync(`${OUT}problem-shorts.md`, md);

const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const font = (f) => `data:font/woff2;base64,${readFileSync(fileURLToPath(new URL(`../digital-products/fonts/${f}`, import.meta.url))).toString("base64")}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url(${font("Inter.woff2")}) format("woff2");font-weight:100 900}
@font-face{font-family:Serif;src:url(${font("DMSerifDisplay.woff2")}) format("woff2")}
@page{size:8.5in 11in;margin:.55in .6in}
body{font:10pt/1.5 Inter;color:#23272f}
h1{font:400 26pt/1.1 Serif;margin:0 0 8pt}
.intro{background:#eef2f6;border-radius:8pt;padding:10pt 14pt;margin-bottom:14pt}
.card{border:.75pt solid #c9ced6;border-radius:8pt;padding:12pt 14pt;margin:0 0 12pt;break-inside:avoid}
.card h2{font:400 15pt/1.2 Serif;margin:0 0 4pt}
.meta{font-size:8.5pt;color:#6b7280;margin-bottom:8pt}
.f{margin:6pt 0}.f b{display:block;font:700 7.5pt Inter;letter-spacing:.14em;text-transform:uppercase;color:#2b4c7e;margin-bottom:2pt}
pre{white-space:pre-wrap;font:8.5pt/1.45 Inter;background:#f4f6f9;border-radius:6pt;padding:8pt 10pt;margin:0}
.tags{color:#2b4c7e;font-weight:600}
</style></head><body>
<h1>Problem-First Shorts: 27 video briefs</h1>
<div class="intro">Each Short leads with ONE specific problem, shows a quick output or before-and-after, then points to the matching Linktree button.<br>
<b>Make it:</b> paste the Video Prompt into Higgsfield → Kling 3 (pro, sound on, 15 s, 9:16; 37.5 credits), or send it to Claude. The real output or planner page and the end card are added in the edit. Turn on each app's AI label. No income claims; example outputs use made-up details.</div>
${SHORTS.map((s) => `<div class="card"><h2>${esc(s.name)}</h2><div class="meta">${esc(s.product)} · Linktree button: ${esc(s.link)}</div>
<div class="f"><b>Video Name</b>${esc(s.name)}</div>
<div class="f"><b>Video Prompt</b><pre>${esc(s.video)}</pre></div>
<div class="f"><b>Output shown (added in edit)</b>${esc(s.output)}</div>
<div class="f"><b>Title</b>${esc(s.title)}</div>
<div class="f"><b>Caption</b>${esc(s.caption)}</div>
<div class="f"><b>Hashtags</b><span class="tags">${esc(s.tags)}</span></div></div>`).join("")}
</body></html>`;
const { chromium } = createRequire(new URL("../digital-products/package.json", import.meta.url))("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const p = await browser.newPage();
await p.setContent(html, { waitUntil: "load" });
await p.evaluate(() => document.fonts.ready);
await p.pdf({ path: `${OUT}problem-shorts.pdf`, width: "8.5in", height: "11in", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(`${SHORTS.length} shorts -> out/problem-shorts.md + .pdf`);
