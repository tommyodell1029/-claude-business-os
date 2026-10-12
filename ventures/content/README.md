# Content (views → Linktree clicks)
- Plan, schedule and captions: `CONTENT_PLAN.md`.
- Carousels: `node ventures/content/carousels.mjs [id]` (FFMPEG env var for the Shorts MP4). Built only from real product content (pack prompts, kit prompts, planner page renders). Output: `out/<id>/NN.png` (1080×1350), `out/<id>/tall/NN.png` (1080×1920), `out/<id>/<id>-shorts.mp4` (silent; add a sound in the app).
