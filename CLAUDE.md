# PixelFrame — Claude Handoff

> Last updated: 2026-05-11

## What This Is
PixelFrame is a web-based pixel art editor — full drawing tools (pencil/eraser/bucket/eyedropper/color-eraser/line/rect/ellipse), marquee selection with transform handles, layers, PICO-8 palette with auto ramps, PNG import/export, IndexedDB autosave. Was called "Pixel Studio" until 2026-05-11.

## Status
PixelFrame (renamed from Pixel Studio) is on GitHub as a private repo at Cougler/PixelFrame. drudzins1 invited as a read-only collaborator and will contribute via the fork workflow (clone their own fork, PR back to main). All Aaron's other GitHub repos were flipped private this session.

## Stack
- Next.js 16 (Turbopack) + React 19
- TypeScript
- Tailwind v4
- Zustand (state)
- idb-keyval (IndexedDB persistence)
- lucide-react (icons)

## Key Locations
- **App**: `~/Apps/pixelframe/` (was `~/Apps/pixel-studio/`)
- **GitHub**: https://github.com/Cougler/PixelFrame (private)
- **Live URL**: https://pixel-studio-swart.vercel.app (Vercel project still named `pixel-studio` — rename pending so URL matches)
- **Dev server**: `npm run dev -- --port 3005` → http://localhost:3005
- **Vercel scope**: `acportfolio`. Deploy: `npx vercel deploy --prod --yes --scope acportfolio`

## Architecture Notes
- App entry: `src/app/page.tsx` + `src/app/layout.tsx` (metadata title is "PixelFrame")
- State: `src/lib/store.ts` (Zustand store — layers, canvas dims, tools, selection, undo/redo)
- Persistence: `src/lib/persist.ts` — IndexedDB key is `pixelframe:doc` (was `pixel-studio:doc` before this session — old autosaves in users' browsers won't load)
- TopBar (`src/components/TopBar.tsx`) renders the brand label "PixelFrame", New/Import/Export buttons + modals for New canvas, Export PNG, Import-with-target-grid
- PNG import: `src/lib/import.ts` — supports sharp (nearest-neighbor) or smooth sampling, caps source at 512px
- Canvas is locked-centered: only zoom, no pan (pan persistence kept causing canvases to load at top-left)
- Drawing tools live in `src/lib/pixels.ts`; types in `src/lib/types.ts`

## Collaborator Workflow (drudzins1)
drudzins1 has **read-only** access on the main repo. Branch protection isn't available on free private repos, so the agreed flow is:
1. drudzins1 forks `Cougler/PixelFrame` → their fork is private to them
2. drudzins1 pushes branches to their fork
3. drudzins1 opens cross-repo PRs into `Cougler/PixelFrame:main`
4. Aaron reviews + merges

Invite is still pending acceptance at https://github.com/Cougler/PixelFrame/invitations. If drudzins1 ever needs more access, can be upgraded with `gh api -X PUT /repos/Cougler/PixelFrame/collaborators/drudzins1 -f permission=push` — but the whole point of read-only is to force PRs.

## Recent Changes (this session)
- Renamed every "pixel-studio" / "Pixel Studio" reference to PixelFrame (package.json, package-lock.json, .mc.json, layout.tsx metadata title, TopBar header label, persist.ts IndexedDB key)
- Renamed folder `~/Apps/pixel-studio` → `~/Apps/pixelframe`
- Initialized git, created private GitHub repo `Cougler/PixelFrame`, pushed `main`
- Flipped all 9 previously-public Cougler repos to private
- Invited drudzins1 as collaborator with `read` permission

## What's Next
- drudzins1 accepts invite + forks the repo
- Rename the Vercel project from `pixel-studio` so the URL matches (currently `pixel-studio-swart.vercel.app`)
- Round brushes
- Animation frames

## Known Issues / Gotchas
- **IndexedDB key changed**: anyone who had work-in-progress in their browser under the old key (`pixel-studio:doc`) won't see it load — autosaves under the new key (`pixelframe:doc`) work fine
- **Vercel project name still old**: deploys still go to the `pixel-studio` Vercel project / URL until renamed
- **Branch protection paywalled**: GitHub charges ($4/mo Pro) to enable branch protection or rulesets on a private repo. We're using the fork workflow as the free workaround — DO NOT assume `main` is protected; technically Aaron can still push directly and so could any future collaborator with write access
- **`.vercel/` folder is gitignored** (in `.gitignore`) so the Vercel link doesn't leak via the repo
