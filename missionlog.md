# PixelFrame — Mission Log

---

## 2026-05-11 — Rename to PixelFrame + private GitHub + collaborator setup

PixelFrame (renamed from Pixel Studio) is on GitHub as a private repo at Cougler/PixelFrame. drudzins1 invited as a read-only collaborator and will contribute via the fork workflow (clone their own fork, PR back to main). All Aaron's other GitHub repos were flipped private this session.

**Done this session:**
- Renamed every "pixel-studio" / "Pixel Studio" reference to PixelFrame: `package.json`, `package-lock.json`, `.mc.json`, `src/app/layout.tsx` (metadata title), `src/components/TopBar.tsx` (header label), `src/lib/persist.ts` (IndexedDB key `pixel-studio:doc` → `pixelframe:doc`)
- Renamed folder `~/Apps/pixel-studio` → `~/Apps/pixelframe`
- Initialized git, created private GitHub repo `Cougler/PixelFrame`, pushed `main`
- Flipped all 9 of Aaron's previously-public GitHub repos to private (mission-control-data, PixelFrame, showcase, studioframe, Hierarch, prouxkit, Portfolio, mission-control, Avataro)
- Invited drudzins1 as collaborator on PixelFrame, then downgraded the pending invite from `write` to `read` after deciding on the fork workflow
- Confirmed branch protection / rulesets are paywalled on free private repos, so settled on read-only + fork PRs instead
- Updated `~/.claude/projects/-Users-aaroncougle/memory/MEMORY.md` to reflect rename, new path, GitHub URL, and IndexedDB key change

**Up next:**
- drudzins1 needs to accept the invite at https://github.com/Cougler/PixelFrame/invitations and fork the repo
- Rename the Vercel project from `pixel-studio` (the live URL `pixel-studio-swart.vercel.app` still uses old name)
- Product-wise: round brushes or animation frames

---
