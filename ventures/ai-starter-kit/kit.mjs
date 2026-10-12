// AI Side Hustle Starter Kit (owner "go kit", 2026-10-11). Built from the Shorts research in SHORTS_RESEARCH.md:
// prompt-based business planning got the most comments, "which AI tools" lists the most views. The kit teaches the
// exact process we used for the Etsy planners and Gumroad prompt packs. It sells a process, never income: no earnings
// claims, no "passive income", no results we do not have. Every prompt tells the AI not to invent facts.

export const STORE = "https://launchpadprompts.gumroad.com";
// Live 2026-10-12 (owner)
export const LINKS = { free: "https://launchpadprompts.gumroad.com/l/free-ai-tools", kit: "https://launchpadprompts.gumroad.com/l/ai-starter-kit" };

// Free AI tools for each step. Plans and limits change, so the PDF tells buyers to check each site; no prices are
// stated as fact.
export const TOOLS = [
  ["Plan and write", [
    ["ChatGPT (chatgpt.com)", "Idea lists, plans, product text, listing copy. Free plan available."],
    ["Claude (claude.ai)", "Longer documents and careful editing. Free plan available."],
    ["Gemini (gemini.google.com)", "A second opinion on ideas and research questions. Free with a Google account."],
  ]],
  ["Make the product", [
    ["Canva (canva.com)", "Printable pages, covers and listing images. Free plan available."],
    ["Google Docs / Slides", "Simple PDFs: write in Docs, export as PDF. Free."],
  ]],
  ["Sell it", [
    ["Gumroad (gumroad.com)", "Sell digital downloads with no monthly fee; Gumroad takes a fee per sale. Check the current fee on their pricing page."],
    ["Etsy (etsy.com)", "Marketplace with buyers already searching. Charges a small listing fee plus fees per sale; check Etsy's current fees."],
  ]],
  ["Get seen", [
    ["CapCut (capcut.com)", "Edit short vertical videos on your phone. Free plan available."],
    ["Pinterest (business account)", "Pins keep sending visitors for months. Free."],
    ["YouTube Shorts / TikTok / Instagram Reels", "Free short-video reach. Label AI-made videos with each app's AI label."],
  ]],
];

export const KIT = {
  slug: "ai-side-hustle-starter-kit",
  title: "AI Side Hustle Starter Kit",
  short: "AI Starter Kit",
  tagline: "30 copy-and-paste AI prompts to pick a small digital product, make it, list it and post about it in 7 days, plus a free AI tools list and a 7-day checklist. The same process we use for our own printables and prompt packs.",
  audience: "Beginners who want to start a small online side project with AI tools, without coding or a big budget",
  palette: { accent: "#3d5a40", tint: "#e7efe6" },
  context: `You are my practical business coach. I'm starting a small digital product side project with AI tools.
Use only the facts I give you. If something is missing, ask me instead of guessing. Never promise income or results.
My skills and interests: [SKILLS AND INTERESTS, e.g. teaching, organizing, baking, fitness]
Time I have each week: [HOURS]
Budget: [AMOUNT, e.g. $0-$20]
Where I want to sell: [Etsy / Gumroad / not sure]
Who I'd like to help: [PEOPLE, e.g. busy parents, new teachers, small shop owners]`,
  sections: [
    { name: "1. Pick your idea", prompts: [
      ["Ideas from what you already know", "Using my skills and interests, list 15 small digital products I could make in a weekend (printables, checklists, templates, planners, prompt packs, guides). For each: who it's for, the problem it solves, and why my background helps. No income estimates."],
      ["Score the ideas", "Score these ideas from 1-5 on: how easy to make in 2 days, how clear the buyer is, how easy to show in a photo or short video, and how much I'd enjoy making it: [PASTE IDEAS]. Show a table, then pick the top 3 and explain why in one line each."],
      ["Check demand yourself (no guessing)", "I'll check demand myself. For my idea [IDEA], give me: 10 search phrases to type into Etsy, Gumroad Discover, Pinterest and YouTube; what to write down for each result (number of listings, review counts, prices I see, how recent); and how to read it. Do not tell me what the results will be."],
      ["Read my demand notes", "Here is what I found when I searched: [PASTE NOTES: listings, review counts, prices, video views]. Using only these notes, tell me whether people seem to be buying or watching this, what the popular versions have in common, and one gap I could fill. Say clearly if the evidence is weak."],
      ["Find my angle", "Popular products for [IDEA] look like this: [DESCRIBE TOP 3]. Suggest 5 ways to make mine different for [WHO I HELP] (niche, format, style, bundle, simpler). Pick the one that is quickest to make."],
      ["My 20-day plan", "Make a 20-day plan to launch [PRODUCT] with [HOURS] hours a week and [BUDGET]. Days 1-7: make it. Days 8-10: list it. Days 11-20: post about it and review numbers. One small task per day, each under [MINUTES] minutes."],
    ] },
    { name: "2. Make the product", prompts: [
      ["Outline the product", "Outline [PRODUCT] for [WHO I HELP]: page list (or section list), what goes on each page, and the one page that makes it worth buying. Keep it small enough to finish in 2 days."],
      ["Write the content", "Write the content for page/section \"[PAGE NAME]\" of [PRODUCT]. Audience: [WHO]. Tone: [TONE]. Use plain words and short lines that fit on a printable page. Mark anything I need to check with [CHECK]."],
      ["Printable layout brief", "Describe a clean layout for a printable page called \"[PAGE NAME]\" that I can build in Canva or Google Docs: page size [US Letter / A4], sections, headings, how many writing lines, fonts that look good together, and 2 color options."],
      ["Prompt pack builder", "I want to sell a prompt pack for [WHO]. List 25 tasks they do every week that AI can help with. Then write 5 example prompts with [BRACKETS] for their details, each telling the AI not to invent facts."],
      ["Quality check", "Act as a picky buyer. Review this product content: [PASTE]. List anything confusing, missing, repeated or too long, and anything that sounds like a promise I can't keep. Then give me a fixed version of the 3 weakest parts."],
      ["Instructions page", "Write a short 'How to use this' page for [PRODUCT]: how to print or open it, how to fill it in, and 3 tips. Under 150 words, friendly."],
    ] },
    { name: "3. List it", prompts: [
      ["Title options", "Write 10 listing titles for [PRODUCT] for [Etsy / Gumroad]. Put the words buyers would search first. Etsy titles under 140 characters. No 'best', no claims I can't prove."],
      ["Description", "Write a listing description for [PRODUCT]: who it's for, the problem it solves, exactly what's included ([FILES, PAGES, SIZES]), how they get it (instant download), and what it is not. Short paragraphs and bullet points. No income or results promises."],
      ["Etsy tags", "Give me 13 Etsy tags for [PRODUCT], each under 20 characters, mixing what it is, who it's for and when it's used. No repeated words from the title where a better phrase exists."],
      ["Pricing from my own research", "Here are prices I saw for similar products: [PASTE PRICES]. Suggest a launch price for mine and explain in 3 lines. Use only these prices; if I gave too few, tell me to check more."],
      ["Listing photos shot list", "Plan 5 listing images for [PRODUCT] using real pages from my file: cover, inside pages, what's included, size/format, and one 'in use' mockup. For each, say what text to put on it in under 8 words."],
      ["Buyer FAQ", "Write 6 short FAQ answers for my listing: file type, printing, sizes, refunds for digital items ([MY POLICY]), editing, and using it on a tablet. Use only my facts: [FACTS]."],
    ] },
    { name: "4. Post about it", prompts: [
      ["Story-style short video script", "Write a 15-second vertical video script in 3 beats: (1) a person struggling with [PROBLEM] says one line, (2) a friend shows them [PRODUCT] in one line, (3) the 'after' shot with one calm line. Natural speech, no income claims. Include on-screen text for each beat."],
      ["Captions", "Write 3 short captions for a video about [PRODUCT] for TikTok, Instagram Reels and YouTube Shorts. Each with a hook line, one sentence about what it is, 'link in bio', and 4 hashtags. If the video uses AI, add 'Made with AI'."],
      ["Pinterest pins", "Write 5 Pinterest pin titles (under 100 characters) and descriptions (under 300 characters) for [PRODUCT] that answer what people search, like '[SEARCH PHRASE]'. Plain, helpful, no clickbait."],
      ["7-day posting plan", "Make a 7-day posting plan for [PRODUCT] across [PLATFORMS] with [MINUTES] minutes a day: what to post each day, the hook, and which product page to show."],
      ["Turn one video into five", "I made this video: [DESCRIBE]. Give me 5 ways to reuse it (different hook, different first frame, a pin, a carousel, a 'how I made it' post) with the exact text for each."],
      ["Reply to comments", "Write friendly replies to these comments on my post: [PASTE COMMENTS]. Answer questions honestly, point to the link only when they ask, and never promise results."],
    ] },
    { name: "5. Run it like an experiment", prompts: [
      ["Set a target", "Help me set a simple 14-day target for [PRODUCT] (for example 'first 3 sales' or '100 listing views'), what I'll count each day, and where I'll find each number in [Etsy Stats / Gumroad Analytics / app insights]."],
      ["Day 7 check", "Here are my numbers after 7 days: [VIEWS, CLICKS, FAVORITES, SALES PER PLATFORM]. Using only these, tell me where people drop off and the one change to try this week."],
      ["Day 14 decision", "Here are my 14-day numbers: [NUMBERS]. Should I keep going, change the listing, change the product, or stop and try the next idea? Give your reasoning in 5 lines and say what extra data would change your answer."],
      ["Next product from the same buyers", "My buyers for [PRODUCT] are [WHO]. Suggest 5 follow-up products or bundles for the same people, smallest first."],
      ["Weekly review", "Ask me 6 quick questions to review my week (what I made, posted, learned, what flopped, numbers, energy). Then write a 3-line plan for next week."],
      ["Keep it honest", "Read my listing and captions: [PASTE]. Flag anything that could read as an income promise, a fake result, missing AI disclosure, or a claim I can't back up, and rewrite those lines."],
    ] },
  ],
};

export const STARTER = {
  slug: "free-ai-tools-and-starter-prompts",
  title: "Free AI Tools List + 3 Starter Prompts",
  tagline: "The free AI tools we use at each step of making and selling a small digital product, and 3 prompts to pick your first idea and plan it.",
  palette: KIT.palette,
  prompts: [KIT.sections[0].prompts[0], KIT.sections[0].prompts[1], KIT.sections[0].prompts[5]],
};

export const CHECKLIST = [
  ["Day 1", "Pick your idea: run prompts 1-2, choose one product and who it's for."],
  ["Day 2", "Check demand yourself (prompts 3-4): write down what you see, decide go or next idea."],
  ["Day 3", "Outline and write the content (prompts 7-8)."],
  ["Day 4", "Build the pages in Canva or Docs and export a PDF (prompt 9). Run the quality check (prompt 11)."],
  ["Day 5", "Make 5 listing images from real pages (prompt 17). Write the title, description and tags (prompts 13-15)."],
  ["Day 6", "Publish the listing on Etsy or Gumroad. Write your first video script and captions (prompts 19-20)."],
  ["Day 7", "Post the first video and 5 pins. Set your 14-day target (prompt 25)."],
];
