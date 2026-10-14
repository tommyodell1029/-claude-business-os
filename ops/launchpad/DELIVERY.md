# Delivery workflow (Website Production → QA → Client Ops)

1. **Config:** copy `sites/clients/riverside-plumbing.json` to `sites/clients/<slug>.json`. Fill it only from the onboarding answers. Set `"concept": false` and the `form.endpoint`.
2. **Build:** `node sites/build.mjs <slug>` → `sites/out/<slug>/index.html` (one self-contained file).
3. **QA:** `node sites/qa.mjs sites/out/<slug>/index.html`. Every check must pass. Save the output into `client_projects.qa`.
4. **Preview:** a private preview link for the client (not indexed). Record it in `client_projects.preview_url`, set status `in_review`.
5. **One revision round:** log requests in `client_projects.revisions`, rebuild, and run QA again.
6. **Approvals:** the client approves the preview in writing. The owner approves the production deploy. Record both in `client_projects.approvals` with date and source. **No production deploy, DNS change or charge without the owner's explicit approval.**
7. **Launch:** the balance is paid, then deploy, then a live QA run (`node sites/qa.mjs https://...`), a test form submission, then `deploy_status: live`.
8. **Handoff:** send `HANDOFF.md` filled in, set `handoff_at`, and offer the care plan.

Known gap before the first real client: the client form endpoint (where a client site's form posts, and who gets the email) isn't built yet. Build and test it when the first deposit is paid. Until then concept sites have their form disabled.
