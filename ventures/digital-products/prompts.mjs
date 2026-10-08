// The three AI prompt packs for the Gumroad validation experiment (owner, 2026-10-08: 3 Gumroad products, target
// 3 sales in 14 days). Research evidence: generic prompt libraries are saturated; buyers pay for role- or
// workflow-specific packs, and content creation/copywriting is the largest segment. Each prompt uses [BRACKETS]
// for the buyer's details and asks the AI not to invent facts.

export const PACKS = [
  {
    slug: "local-service-business-prompts",
    title: "Local Service Business Marketing Prompts",
    short: "Service Business Prompts",
    tagline: "30 copy-and-paste AI prompts for plumbers, cleaners, landscapers, electricians, HVAC and every local service business: Google profile posts, review replies, quote follow-ups, website pages and repeat business.",
    audience: "Owners and office managers of local service businesses",
    palette: { accent: "#2b4c7e", tint: "#e6ecf5" },
    context: `You are helping me market my local service business. Use only the facts I give you; if something is missing, ask me instead of guessing.
Business name: [BUSINESS NAME]
Trade / services: [SERVICES]
Service area: [CITY AND NEARBY AREAS]
What makes us different: [2-3 REAL DIFFERENCES, e.g. same-day service, family-owned since 2009]
Tone: [friendly / professional / no-nonsense]
Things we never promise: [e.g. exact prices without an inspection]`,
    sections: [
      { name: "Google Business Profile", prompts: [
        ["Weekly update post", "Write a Google Business Profile update for [BUSINESS NAME] about [RECENT JOB OR TOPIC] in [CITY]. 80-120 words, one clear call to action ([CALL / BOOK ONLINE]), no hashtags, no prices unless I give them. Give me 3 versions with different openings."],
        ["Seasonal tip post", "Write a Google Business Profile post with one practical [SEASON] tip for homeowners in [CITY] about [TOPIC, e.g. preparing AC for summer]. Make the tip genuinely useful on its own, then mention we can help. Under 120 words."],
        ["Offer post", "Write a Google Business Profile offer post for this real offer: [OFFER, DATES, CONDITIONS]. Include the conditions plainly. Give a short title (under 58 characters) and 2 body versions under 100 words."],
        ["Services description", "Write the 'From the business' description for our Google Business Profile (max 750 characters). Cover: what we do ([SERVICES]), where ([SERVICE AREA]), and why choose us ([DIFFERENCES]). Natural language, no keyword stuffing, no claims I did not give you."],
        ["Q&A section", "List 10 questions customers in [CITY] commonly ask a [TRADE] business before hiring, then write a short, honest answer for each using only these facts: [FACTS: hours, areas, licenses, warranty, payment methods]. Flag any answer where you need more information from me."],
      ] },
      { name: "Reviews", prompts: [
        ["Reply to a 5-star review", "Write a reply to this 5-star review: \"[REVIEW TEXT]\". Thank them by first name, mention the specific job they described, and keep it under 60 words. Do not offer discounts. Give 3 versions that do not sound templated."],
        ["Reply to a negative review", "Write a calm, professional public reply to this negative review: \"[REVIEW TEXT]\". Our side of the story: [WHAT ACTUALLY HAPPENED]. Do not argue, do not share private details, take responsibility where it is fair, and invite them to contact [NAME] at [PHONE OR EMAIL] to fix it. Under 90 words."],
        ["Review request text", "Write a short text message asking [CUSTOMER FIRST NAME] for a Google review after we [JOB DONE] today. Friendly, under 300 characters, includes the link [REVIEW LINK], no incentives (incentivized reviews break Google's rules)."],
        ["Review request email", "Write a follow-up email asking a happy customer for a review a few days after [JOB]. Under 120 words, explain in one line why reviews help a small local business, include [REVIEW LINK], and make it easy to say no."],
        ["Turn reviews into marketing", "Here are [NUMBER] of our real reviews: [PASTE REVIEWS]. Pull out the 5 themes customers mention most, quote the best real sentence for each (word for word, no edits), and suggest where to use each one (website, truck, social post)."],
      ] },
      { name: "Leads & quotes", prompts: [
        ["Missed-call text back", "Write a text we send automatically when we miss a call: introduce [BUSINESS NAME], say we will call back within [TIME], and ask what they need help with. Under 250 characters. Give 3 versions."],
        ["First reply to a web lead", "A customer filled in our website form: \"[THEIR MESSAGE]\". Write a reply email that answers what we can from these facts: [FACTS], asks the 2-3 questions we need to quote, and offers [BOOKING OPTION]. Under 150 words."],
        ["Quote cover message", "Write the email that goes with our quote of [AMOUNT] for [JOB] at [ADDRESS OR AREA]. Summarize what is included ([INCLUDED]) and not included ([EXCLUDED]), how long it is valid ([DAYS]), and the next step to book. Plain and confident, under 150 words."],
        ["Quote follow-up sequence", "Write 3 short follow-ups for a quote with no reply: day 2 (text), day 5 (email), day 10 (text, polite last check). No pressure tactics, no fake deadlines. Each under 60 words."],
        ["Price objection reply", "A customer said our quote of [AMOUNT] is higher than [COMPETITOR OR 'another quote']. Write a respectful reply that explains what is included ([INCLUDED, WARRANTY, LICENSE, INSURANCE]) without criticizing the competitor, and offers [OPTION IF ANY]. Under 120 words."],
        ["Phone script for new callers", "Write a simple phone script for whoever answers our phone: greeting, 5 questions to qualify the job ([TYPE OF JOBS WE WANT]), how to book, and what to say when it is a job we do not do. Keep each line short and natural."],
      ] },
      { name: "Website & local SEO", prompts: [
        ["Service page", "Write a website page for our [SERVICE] service in [CITY]. Sections: what the service is, signs you need it, how our process works ([STEPS]), service area, FAQ (4 questions), call to action. 500-700 words, helpful first, no invented stats or guarantees."],
        ["City / area page", "Write a page for customers in [NEIGHBORHOOD OR TOWN] that is genuinely about that area: local details I give you ([LOCAL DETAILS: housing age, common problems, landmarks]) and how we serve it. Avoid copying our other area pages; 400-500 words."],
        ["Homepage headline options", "Give me 10 homepage headline + subheadline pairs for [BUSINESS NAME], a [TRADE] in [CITY]. Each headline under 10 words and specific about the customer's problem. Mark your top 3 and say why."],
        ["Meta titles and descriptions", "Write SEO titles (under 60 characters) and meta descriptions (under 155 characters) for these pages: [LIST OF PAGES]. Include the service and city naturally, no keyword stuffing, one call to action per description."],
        ["Blog post from a real job", "Turn this real job into a short blog post: [WHAT THE PROBLEM WAS, WHAT WE FOUND, WHAT WE DID, RESULT]. Teach the reader something useful, include what a homeowner can check themselves, and end with when to call a pro. 400-600 words. No customer names or addresses."],
      ] },
      { name: "Social media & email", prompts: [
        ["Before/after post", "Write a Facebook/Instagram caption for before-and-after photos of [JOB] in [AREA]. What was wrong, what we did, one tip. Under 100 words, 3-5 relevant hashtags, no customer details."],
        ["30-day content calendar", "Make a 30-day social posting plan for a [TRADE] business: mix of tips, behind-the-scenes, job highlights, team, and reviews. Table with day, post idea, format (photo/video/text), and a one-line caption starter. Seasonal for [MONTH] in [CITY]."],
        ["Short video script", "Write a 30-45 second vertical video script where [PERSON] explains [COMMON PROBLEM] and one thing homeowners can check. Hook in the first 3 seconds, plain words, ends with a soft call to action. Include shot notes."],
        ["Monthly customer email", "Write a monthly email for past customers: one seasonal tip ([TOPIC]), one company update ([UPDATE]), and a reminder to book [MAINTENANCE SERVICE]. Under 200 words, subject line options x3."],
        ["Nextdoor / community post", "Write a helpful post for a neighborhood group in [AREA] that offers a genuinely useful [TRADE] tip and only lightly mentions we are local. Under 120 words, not salesy, follows typical community rules against ads."],
      ] },
      { name: "Repeat business & referrals", prompts: [
        ["Job-complete thank-you", "Write a thank-you text sent after we finish [JOB]: thanks, what we did in one line, how to reach us if anything is wrong, and when they should think about [NEXT SERVICE]. Under 300 characters."],
        ["Maintenance reminder", "Write a reminder that it has been [TIME] since [CUSTOMER FIRST NAME]'s last [SERVICE], why maintenance matters (one sentence, no scare tactics), and how to book. Text version under 300 characters and email version under 120 words."],
        ["Referral ask", "Write a short message asking a happy customer if they know anyone who needs a [TRADE]. Mention our referral thank-you only if I give one: [REFERRAL REWARD OR 'none']. Warm, no pressure, under 80 words."],
        ["Win back a past customer", "Write a friendly check-in to a customer we have not served in [TIME]: no guilt, remind them what we do, mention [REAL REASON TO CALL: season, new service], and make booking easy. Under 100 words."],
      ] },
    ],
  },
  {
    slug: "real-estate-agent-prompts",
    title: "Real Estate Agent Listing & Social Prompts",
    short: "Real Estate Prompts",
    tagline: "30 AI prompts for agents: listing descriptions, open house and just-sold posts, buyer and seller emails, video scripts, market updates and client conversations, with fair housing guardrails built in.",
    audience: "Real estate agents and small teams",
    palette: { accent: "#7a4b8c", tint: "#f2eaf5" },
    context: `You are helping me, a real estate agent, write marketing and client communication. Use only the facts I give you and never invent property features, numbers or school ratings.
Follow fair housing rules: describe the property and its features, never the kind of people who should live there (no references to race, religion, sex, disability, familial status, national origin or other protected classes, and no phrases like "perfect for families" or "walking distance to churches").
My name and brokerage: [NAME, BROKERAGE]
Market: [CITY / AREAS]
Tone: [warm / polished / straightforward]
Brokerage or MLS rules I must follow: [e.g. required disclosures]`,
    sections: [
      { name: "Listings", prompts: [
        ["MLS listing description", "Write an MLS description for [ADDRESS OR 'this home'] using only these facts: [BEDS, BATHS, SQFT, LOT, YEAR, UPDATES, FEATURES, HOA]. Lead with the strongest real feature, keep to [CHARACTER LIMIT] characters, no exaggerations, fair-housing compliant. Give 2 versions."],
        ["Feature-led listing variations", "Rewrite this listing description 3 ways, each leading with a different real feature: [DESCRIPTION]. Keep facts unchanged. Point out anything that might not be fair-housing compliant."],
        ["Luxury listing", "Write a refined listing description for a higher-end property using these facts: [FACTS]. Elegant but concrete: name materials, views and finishes I list, avoid empty words like 'stunning' more than once."],
        ["Condo / townhome listing", "Write a listing for a condo/townhome with these facts: [FACTS, HOA FEES AND WHAT THEY COVER, AMENITIES, PARKING, PET RULES AS STATED]. Make the HOA value clear without overselling."],
        ["Land / lot listing", "Write a listing for a land parcel: [ACREAGE, ZONING, UTILITIES, ACCESS, SURVEY, RESTRICTIONS]. Explain what a buyer can and cannot do based only on what I provide; flag what a buyer should verify."],
        ["Listing compliance check", "Review this listing text for fair housing problems, unverifiable claims and exaggerations: [TEXT]. List each issue, why it matters, and a compliant rewrite. Then give the corrected full text."],
      ] },
      { name: "Social media", prompts: [
        ["Just listed post", "Write an Instagram/Facebook 'Just Listed' caption for [ADDRESS OR AREA] with [3 KEY FACTS], showing date [DATE] and a call to action to [ACTION]. Under 120 words, 5 relevant hashtags, fair-housing compliant."],
        ["Open house post", "Write an open house announcement for [ADDRESS] on [DATE, TIME]: 3 real highlights, parking or entry notes [NOTES], and RSVP option [LINK OR 'none']. Two versions: social caption and a short text for my sphere."],
        ["Just sold post", "Write a 'Just Sold' post for [AREA] that tells a short true story about the sale ([WHAT HAPPENED, e.g. multiple offers, closed in 21 days]) without sharing private client details or numbers I have not cleared. Under 100 words."],
        ["Carousel outline", "Create a 7-slide carousel outline on [TOPIC, e.g. what a buyer pays at closing in [STATE]]. Slide-by-slide headline and 1-2 lines of copy. Add a note on any facts I need to verify for my state."],
        ["Agent intro post", "Write a 'meet your agent' post about me using these facts: [BACKGROUND, YEARS, AREAS, WHY I DO THIS, ONE PERSONAL DETAIL]. Warm, under 150 words, no claims of 'top' or 'best' unless I give you the source."],
        ["Two weeks of posts", "Plan 14 days of posts for an agent in [MARKET]: listings, tips, local spotlights, client stories (with permission), personal posts. Table with day, idea, format and a caption starter."],
      ] },
      { name: "Email & lead nurture", prompts: [
        ["New buyer lead reply", "A buyer lead wrote: \"[MESSAGE]\". Write a quick, helpful reply that answers what I can ([FACTS]), asks 3 questions (timeline, financing, must-haves) and offers [NEXT STEP]. Under 120 words."],
        ["Seller lead reply", "A homeowner asked what their home is worth: \"[MESSAGE]\". Write a reply that explains how I prepare a comparative market analysis, what I need from them, and offers a time to talk. No value estimate. Under 130 words."],
        ["5-email buyer nurture", "Write a 5-email sequence for new buyer leads over 3 weeks: 1) welcome and next steps, 2) how pre-approval works, 3) how offers work in [MARKET], 4) common mistakes, 5) check-in. Each under 150 words with a subject line."],
        ["Past client check-in", "Write a check-in email to a past client from [YEAR]: personal touch [DETAIL], a useful home-owner reminder ([e.g. homestead exemption deadline in [STATE] if applicable]), and an easy reply ask. Under 120 words."],
        ["Expired listing outreach letter", "Write a respectful letter to the owner of an expired listing in [AREA]. Acknowledge the frustration, explain 3 specific things I would do differently ([MY PLAN]), no criticism of the previous agent. Under 220 words. Note any do-not-contact rules I must check first."],
        ["Monthly newsletter", "Write a short monthly newsletter for my sphere: local market note using only these numbers [NUMBERS + SOURCE], one home tip, one local event [EVENT], and a soft referral ask. Under 300 words."],
      ] },
      { name: "Video scripts", prompts: [
        ["Listing walkthrough", "Write a 60-second vertical walkthrough script for [ADDRESS OR 'this home'] covering [ROOMS / FEATURES IN ORDER]. Hook in 3 seconds, short lines I can say naturally, on-screen text suggestions, compliant language."],
        ["Buyer myth-buster", "Write a 45-second script busting one myth buyers in [MARKET] believe about [TOPIC]. State the myth, the reality (only facts I can verify — flag them), and one action step."],
        ["Neighborhood spotlight", "Write a 60-second neighborhood spotlight for [NEIGHBORHOOD] using these real places and facts: [PLACES, PARKS, COMMUTE TIMES I PROVIDE]. Describe places and amenities, never the people who live there."],
        ["Seller tip", "Write a 30-second script with one practical tip for sellers preparing to list in [SEASON], plus a call to action to [ACTION]. Include 3 caption options."],
      ] },
      { name: "Market updates & guides", prompts: [
        ["Market update in plain English", "Turn these numbers into a plain-English market update for buyers and sellers: [MEDIAN PRICE, DAYS ON MARKET, INVENTORY, SALE-TO-LIST, PERIOD, SOURCE]. What it means for each side, 150-200 words, cite the source line at the end."],
        ["First-time buyer guide", "Outline a first-time buyer guide for [STATE/CITY]: steps from pre-approval to keys, typical timeline, documents, and costs to expect. Mark every state-specific item I must verify. Use headings and short paragraphs."],
        ["Seller prep checklist", "Create a room-by-room listing prep checklist (quick wins under $100, weekend projects, things to leave alone). Printable, short bullets."],
        ["Relocation welcome guide", "Write a relocation guide outline for people moving to [CITY]: areas overview (amenities and commute only), utilities to set up, DMV/registration steps, and local resources I list [RESOURCES]."],
      ] },
      { name: "Client conversations", prompts: [
        ["Explain a low offer", "Help me explain to my sellers why an offer came in at [AMOUNT] vs list [LIST PRICE], using these comps [COMPS] and buyer notes [NOTES]. Calm, factual talking points and 3 response options to discuss."],
        ["Price reduction conversation", "Write talking points for recommending a price change to sellers after [DAYS] days with [SHOWINGS/FEEDBACK]. Empathetic, data-based ([DATA]), with 2 alternatives to a reduction."],
        ["Inspection repair request", "Draft a clear, reasonable repair request based on these inspection items: [ITEMS]. Group by priority, suggest repair vs credit, and keep the tone cooperative."],
        ["Closing day message", "Write a closing-day congratulations message for [CLIENT FIRST NAMES] with a personal note [DETAIL], what to do in the first week (change locks, utilities, keep documents), and how to reach me. Under 150 words."],
      ] },
    ],
  },
  {
    slug: "etsy-seller-prompts",
    title: "Etsy Seller Listing & SEO Prompts",
    short: "Etsy Seller Prompts",
    tagline: "30 AI prompts for Etsy sellers: search-friendly titles and all 13 tags, descriptions that answer buyer questions, photo shot lists, shop setup, customer messages, review replies and Pinterest pins.",
    audience: "Etsy sellers, especially new shops and digital-download sellers",
    palette: { accent: "#c8553d", tint: "#fbeae5" },
    context: `You are helping me run my Etsy shop. Use only the facts I give you about my products and never invent materials, sizes, reviews or sales numbers.
Shop name: [SHOP NAME]
What I sell: [PRODUCT TYPE]
Who buys it: [BUYER, e.g. teachers, new moms, gift shoppers]
Style / brand words: [3-5 WORDS]
Rules to follow: Etsy's seller policies, including disclosing AI-assisted designs where Etsy requires it.`,
    sections: [
      { name: "Titles & tags", prompts: [
        ["Search-friendly title", "Write 5 Etsy titles (max 140 characters) for this product: [PRODUCT, KEY FEATURES, WHO IT IS FOR]. Put the clearest description of what it is in the first 40 characters, read naturally (no keyword lists), and use only true features."],
        ["All 13 tags", "Give me 13 Etsy tags (each max 20 characters, multi-word phrases where possible) for [PRODUCT]. Mix: what it is, who it is for, occasion, style, and use. No repeated words across more than 3 tags. Output as a comma-separated list."],
        ["Long-tail keyword ideas", "List 30 long-tail search phrases a buyer might type to find [PRODUCT], grouped by intent (gift, problem to solve, style, occasion). Mark which you would use in title vs tags vs description."],
        ["Title audit", "Review my current title and tags: [TITLE] / [TAGS]. Point out wasted characters, repeated words and missing buyer phrases, then give an improved title and full tag set."],
        ["Attributes checklist", "For a [PRODUCT CATEGORY] listing, list every Etsy listing attribute/field I should fill in (category, occasion, holiday, colors, style, etc.) and suggest values based on these facts: [FACTS]."],
        ["Seasonal keyword refresh", "It is [MONTH]. Suggest seasonal versions of my title and 4 replacement tags for [PRODUCT] for upcoming occasions in the next 6-8 weeks. Only occasions that truly fit the product."],
      ] },
      { name: "Descriptions", prompts: [
        ["Full listing description", "Write an Etsy description for [PRODUCT] using these facts: [FACTS: what is included, sizes/formats, materials or file types, how it works, processing time]. Structure: 2-line hook, what you get (bullets), how to use, FAQ (3), shop note. No claims I did not give you."],
        ["Digital download description", "Write a description for a digital download: [PRODUCT, FILE TYPES, SIZES, NUMBER OF PAGES]. Make it crystal clear nothing physical ships, how to download, printing tips, and personal-use terms ([TERMS]). Include an AI-assistance disclosure line if I tell you AI was used: [YES/NO]."],
        ["Gift-buyer angle", "Rewrite this description for gift buyers: [DESCRIPTION]. Answer: who it is a great gift for (use cases, not demographics I did not give), how fast it arrives, gift options [OPTIONS]."],
        ["FAQ builder", "Write 8 FAQs with short answers for [PRODUCT] based on these facts and policies: [FACTS + POLICIES]. Cover sizing, timing, customization, returns and care. Flag anything you need me to confirm."],
        ["Personalization instructions", "Write clear personalization instructions for buyers of [PRODUCT]: what they can customize ([OPTIONS]), character limits, format to type it in, and what happens if info is missing. Under 400 characters for Etsy's personalization box."],
      ] },
      { name: "Photos & listing images", prompts: [
        ["Photo shot list", "Make a 10-image shot list for my [PRODUCT] listing: main image, scale shot, detail, in-use, what's included, size chart, back/inside, packaging, lifestyle, and a text-overlay info image. One line on how to shoot each with a phone."],
        ["Text for listing graphics", "Write short on-image text for 5 listing graphics for [PRODUCT]: 'what's included', 'how it works', 'sizes', 'why buyers like it' (use only real features), and 'instant download' if digital. Max 8 words per line."],
        ["Main image critique", "I will describe my main listing photo: [DESCRIPTION]. Tell me how it might look as a small search thumbnail, and give 5 concrete changes to make it clearer and more clickable."],
        ["Alt text", "Write descriptive alt text (under 250 characters each) for these listing images: [IMAGE DESCRIPTIONS]. Accurate and helpful for screen readers, not keyword-stuffed."],
      ] },
      { name: "Shop setup", prompts: [
        ["Shop announcement", "Write my Etsy shop announcement: what I make, who it is for, current processing times ([TIMES]) and one current note ([NOTE]). Under 500 characters, friendly."],
        ["About section", "Write my shop's About section from these facts: [MY STORY, HOW I MAKE THINGS, WHERE, WHY]. Warm, specific, under 300 words, no claims about sales or rankings."],
        ["Shop policies in plain words", "Turn these policies into clear buyer-friendly text: [RETURNS, EXCHANGES, CANCELLATIONS, DIGITAL DOWNLOAD TERMS, CUSTOM ORDERS]. Keep them consistent with Etsy's rules; flag anything that might conflict."],
        ["Product line ideas", "Based on my best seller [PRODUCT] and buyer [BUYER], suggest 10 related products or variations I could add, each with the buyer problem it solves and a one-line listing title draft. Mark the 3 easiest to make."],
      ] },
      { name: "Customer service", prompts: [
        ["Order thank-you message", "Write the message buyers see after purchase for [PRODUCT]: thank you, what happens next ([PROCESSING / DOWNLOAD STEPS]), how to reach me. Under 500 characters."],
        ["Download help reply", "A buyer cannot find their digital download. Write a friendly reply with the exact steps to find files in their Etsy account (Purchases and reviews > Download files) and an offer to help further. Under 120 words."],
        ["Delayed order reply", "Write an honest reply to a buyer whose order is delayed because [REASON]. New date [DATE], what I am doing about it, and options ([OPTIONS]). Apologetic but not over the top. Under 120 words."],
        ["Custom request reply", "A buyer asked: \"[REQUEST]\". Write a reply saying [YES WITH TERMS / NO, BUT HERE IS AN ALTERNATIVE], with price/timing only if I give them ([DETAILS]). Under 120 words."],
        ["Reply to a critical review", "Write a calm public response to this review: \"[REVIEW]\". What actually happened: [FACTS]. No arguing, no private details, show future buyers I care. Under 80 words."],
        ["Review request (no incentives)", "Write a short follow-up message a week after delivery asking how [PRODUCT] is working out and, if they are happy, whether they would leave a review. No incentives (against Etsy policy). Under 300 characters."],
      ] },
      { name: "Marketing", prompts: [
        ["Pinterest pins", "Write 5 Pinterest pin titles (under 100 characters) and descriptions (under 300 characters) for [PRODUCT], each targeting a different search idea ([IDEAS]). Natural keywords, one call to action."],
        ["Instagram / TikTok captions", "Write 5 short captions showing [PRODUCT] being used or made, each with a hook line, one useful detail, and a soft call to action. Under 80 words each, 4 relevant hashtags."],
        ["Sale email to past buyers", "Write an email for my real sale: [OFFER, DATES, CONDITIONS]. Short, clear, subject line options x3, no fake urgency beyond the real end date."],
        ["Launch plan for a new listing", "Make a 7-day launch checklist for my new listing [PRODUCT]: listing polish, photos, social posts, Pinterest, telling past buyers, and what to measure (views, favorites, sales) each day."],
        ["Monthly numbers review", "Here are my shop stats for [MONTH]: [VISITS, VIEWS, ORDERS, CONVERSION, TOP LISTINGS, TRAFFIC SOURCES]. Explain what they suggest in plain words and give 5 specific things to try next month. Do not assume numbers I did not give."],
      ] },
    ],
  },
];

export const promptCount = (p) => p.sections.reduce((n, s) => n + s.prompts.length, 0);
