# Story video standard (owner, 2026-10-10)

From now on, every promo video uses this format. The UGC talking-head versions are retired, because the owner felt their lip sync looked AI-made.

## Format (about 18.5 s, 1080×1920)
1. **0–5 s, the struggle:** a character hits the exact pain the product solves and says it to camera.
2. **5–10 s, the friend:** a friend or colleague mentions the product in general terms, in one line.
3. **10–15 s, after:** the same character is calmer, with the task done, and says one line.
4. **End card, 3.5 s:** the real product image, the price and "Link in bio". `node videos.mjs --story <id>` adds it.

## How to make one
- **Model:** Kling 3 on Higgsfield (`kling3_0`). Settings: `mode: "pro"`, `sound: "on"`, `duration: 15`, `aspect_ratio: "9:16"`. It costs 37.5 credits. Check the balance first, and use `get_cost` before a batch.
- **Pilot first:** with a new product or a new style, make one video, check it, then make the rest.
- **If Higgsfield suggests a preset instead of generating:** retry with the `declined_preset_id` it returns.
- **Save the clip** to `out/videos/story/<id>-clip.mp4`, then run `FFMPEG=<ffmpeg> node videos.mjs --story <id>`.

## Prompt template
```
Vertical 3D animated cartoon short in a warm, polished Pixar-style look: soft lighting, expressive rounded characters, clean colors. Three shots, same two characters throughout, clear lip-synced English dialogue, light comedic tone.

Shot 1 (0-5s): <setting + character + visible mess>. <Character> says to camera, <emotion>: "<pain line, under 12 words>"

Shot 2 (5-10s): <friend> <enters/leans in> holding <the product: printed page / tablet with prompt>. The friend says <warmly>: "<what it does, under 14 words>"

Shot 3 (10-15s): <same place, now calm/tidy, task done>. <Character> says <relaxed/proud>: "<after line, under 10 words>"

No on-screen text, no logos, no subtitles.
```

## Rules (do not drop these)
- **"After" scenes:** the task is done and the character is calmer. No money, sales, revenue, follower counts or other numbers presented as results.
- **The friend:** describes what the product does. No claims like "it doubled my clients".
- **AI label:** every video carries the "Animated dramatization · AI-generated" label (added by `--story`). Turn on each platform's AI label when posting.
- **Facts:** only real product facts: what's in the pages or prompts, and the real price.

## The 8 current scripts (pain line → friend line → after line)

| ID | Pain line | Friend line | After line |
|---|---|---|---|
| V1 | "Forty reviews... and I haven't answered a single one." | "I just paste the review into a prompt. It gives me three replies." | "All answered. Before my coffee got cold." |
| V2 | "Every listing I write sounds the same. And I'm scared I'll say the wrong thing." | "Use a prompt that writes from your facts only. Fair housing rules built in." | "Listing's live. And it actually sounds like me." |
| V3 | "Thirteen tags?! I never know what to write." | "There's a prompt for that. All thirteen tags in one go." | "Done. On to the next one!" |
| P1 | "Three papers due, and I don't even know where to start." | "Brain dump everything on this page. Then pick just three." | "Okay... I actually got through today." |
| P2 | "It's Sunday night and I haven't planned a single lesson." | "My whole week fits on one page now. Sub plans too." | "Ready for the week. Even the sub plans." |
| P3 | "Money comes in, money goes out... where did it all go?" | "Track it on one page a month. And set the tax money aside first." | "For once, I know exactly where I stand." |
| P4 | "Who has practice tonight? And what's for dinner?!" | "We put the whole week on one page. It lives on the fridge." | "Now everyone just checks the fridge." |
| P5 | "I lost another lead. I can't keep track of all these quotes." | "Write every call on one sheet. Follow up twice." | "Hi! Just following up on that quote." |

The settings (plumber's kitchen table, dorm room, bakery and so on) and the Higgsfield job IDs are in `README.md`, under "Animated story versions".
