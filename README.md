# LeetCode Sync

A Manifest V3 Chrome Extension that automatically syncs your **accepted**
LeetCode solutions to a GitHub repository — no backend required.

## Tech stack

- Manifest V3
- TypeScript (strict)
- Vite + [`@crxjs/vite-plugin`](https://crxjs.dev/vite-plugin)
- Chrome Extension APIs
- GitHub REST API (Contents API)

## Project structure

```
src/
  background/   # MV3 service worker: messages, GitHub calls, retries, notifications
  content/      # Injected on leetcode.com: detect accepted submissions, extract code
  popup/        # Toolbar popup UI
  options/      # Settings page
  github/       # Reusable GitHub REST API wrapper
  storage/      # Typed chrome.storage.local wrapper
  parser/       # LeetCode submission/solution parsing
  utils/        # Shared helpers
  types/        # Shared TypeScript types
  assets/       # Icons
  manifest.ts   # Manifest V3 (authored in TS via defineManifest)
```

## Development

```bash
npm install
npm run dev      # Vite dev server with HMR (load dist/ as unpacked)
npm run build    # Type-check + production build to dist/
npm test         # Unit tests (node --test; analysis, classification, paths, READMEs)
```

## Multiple solutions

Every accepted submission is kept; nothing has to be set up before submitting.

- Identical code (ignoring whitespace and the notes header) is skipped.
- Near-identical code (e.g. a comment edit) updates the existing solution.
- A genuinely different solution is saved beside the first one, e.g.
  `Two Sum/solution-2/1. Two Sum.py`; the first solution never moves.
- Time/space complexity and the pattern are detected from the code only when
  the analyzer is confident; otherwise they stay blank.
- Labels (Optimal, Better, Brute Force, Alternative, Recursive/Iterative) are
  derived from those complexities and recomputed as solutions are added. With
  incomplete information solutions are just "Primary" / "Solution N".
- The popup lists the open problem's solutions (⭐ = best by asymptotic
  complexity). Labels, complexity and notes can be edited there; giving a
  solution (including the primary) a new name moves it on GitHub to
  `<Problem>/<new-name>/`.
- To pick the folder yourself: "+ Add solution manually", enter a name
  (e.g. "Brute Force"). It appears in the list; while it is selected, the next
  accepted submission (or Force sync) is saved to `Two Sum/brute-force/` with
  the notes and complexity you entered for it. Selecting any saved solution
  switches back to automatic placement.

### Load the unpacked extension

1. Run `npm run build` (or `npm run dev`).
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `dist/` folder.

## Status

Scaffolding complete (folder structure, Vite config, Manifest V3, build setup).
Feature modules are implemented step by step.
