# Third-party notice

The skills `sales-prep`, `sales-objections`, `sales-proposal`, `sales-followup`, `sales-icp` and `sales-competitors` in this folder are adapted from https://github.com/zubair-trabzada/ai-sales-team-claude (commit efef8b8), used under the MIT License below. LaunchPad Local changed them to fit its business and compliance rules.

```
MIT License

Copyright (c) 2026 Zubair Trabzada

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```


---

The skills `motion-framer`, `modern-web-design`, `animated-component-libraries`, `scroll-reveal-libraries` and `lottie-animations` in this folder are copied unmodified from https://github.com/freshtechbro/claudedesignskills (commit 1da73fe), used under the MIT License below. LaunchPad Local's website rules in the root CLAUDE.md take precedence over anything in them.

```
MIT License

Copyright (c) 2025 Claude Skills Project

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Added 2026-10-13 (owner request)
- **frontend-design**: from anthropics/skills @ dbd4588 (`skills/frontend-design`), Apache License 2.0 (`frontend-design/LICENSE.txt`). Unmodified.
- **ui-ux-pro-max**: from nextlevelbuilder/ui-ux-pro-max-skill @ 7246805 (`.claude/skills/ui-ux-pro-max`, v2.15.0), MIT License (`ui-ux-pro-max/LICENSE`). Unmodified. Its search scripts are Python standard library and run offline on the bundled CSV data.
- **playwright-skill**: from lackeyjb/playwright-skill @ dd47a6a (`skills/playwright-skill`, v5.0.0), MIT License (`playwright-skill/LICENSE`). One change: `playwright` is pinned to `1.56.1` (the version already used in `ventures/digital-products`) instead of `^1.62.0`, and the upstream lockfile was dropped. `node_modules/` is gitignored. Set it up with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` in the skill folder. In the cloud container the browser comes from `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH`), so never run `npx playwright install`. Run headless here because there's no display.
- Our rules still apply on top of all three: CLAUDE.md website rules (max 3 animated effects on our landing page, mobile Lighthouse ≥ 90 for client sites, `prefers-reduced-motion`, pinned and bundled libraries with no CDN tags in shipped code, no fake stats or testimonials).
