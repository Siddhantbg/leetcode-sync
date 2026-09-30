# LeetCode Sync

A Manifest V3 Chrome extension that automatically commits your **accepted**
LeetCode solutions to a GitHub repository — with multiple-solution tracking,
automatic complexity detection and generated READMEs. No backend: everything
runs in the browser and talks directly to the GitHub API.

## Features

- **Automatic sync** — solve a problem, get *Accepted*, and the code is
  committed to your repo within seconds. No copy-paste, no button clicks.
- **Solution history** — every distinct accepted solution is kept:
  - identical code (ignoring whitespace and the notes header) is skipped,
  - near-identical resubmissions (comment edits, small tweaks) update the
    existing solution in place,
  - a genuinely different approach is saved beside the first one
    (`Two Sum/solution-2/1. Two Sum.py`); the first solution never moves.
- **Complexity & pattern detection** — a static analyzer estimates time/space
  complexity and the algorithmic pattern (hash map, two pointers, binary
  search, sliding window, …) for 10+ languages. It is deliberately
  conservative: when it isn't confident, the value is left blank rather than
  guessed.
- **Automatic classification** — solutions are labelled *Optimal*, *Better*,
  *Brute Force*, *Alternative* or *Recursive / Iterative* from their
  complexities, and the best one is starred (⭐). Ranking is by asymptotic
  complexity, never by LeetCode runtime alone.
- **Named solutions** — name a solution in the popup ("Brute Force") before
  writing it; while it is selected, the next accepted submission is saved to
  `<Problem>/brute-force/` with the notes and complexity you entered.
- **Rename = move** — renaming a saved solution (including the primary) moves
  its folder on GitHub.
- **Generated READMEs** — a per-problem README (best solution first, complexity,
  pattern, notes, links) and an optional progress README with difficulty
  counts and a daily streak.
- **Configurable layout** — root folder, by-difficulty or flat folders,
  `1. Two Sum.py` or `0001_Two_Sum.py` file names, one folder per problem,
  custom commit messages, optional notes header in each file.

## Example repository layout

```
LeetCode/
  README.md                                  # progress (optional)
  Easy/
    1. Two Sum.py                            # first solution
    Two Sum/
      README.md                              # index: ⭐ best first
      solution-2/
        1. Two Sum.py                        # a different approach
        README.md
  Medium/
    Rearrange Array Elements by Sign/
      optimal/                               # a renamed / named solution
        2149. Rearrange Array Elements by Sign.java
        README.md
```

## Installation

1. Build the extension:
   ```bash
   npm install
   npm run build
   ```
2. Open `chrome://extensions`, enable **Developer mode**, click
   **Load unpacked** and select the `dist/` folder.
3. Create a GitHub repository for your solutions (it can be empty).
4. Create a
   [fine-grained Personal Access Token](https://github.com/settings/tokens?type=beta)
   with **Contents: Read and write** access to that repository.
5. Open the extension's **Settings**, paste the token, choose the repository
   and branch, and adjust the folder/file naming options.

Solve a problem on [leetcode.com](https://leetcode.com) — the popup shows the
sync status, your stats and the problem's saved solutions.

## How it works

```
content script (leetcode.com)          background service worker            GitHub
───────────────────────────────        ──────────────────────────────       ──────────
poll LeetCode GraphQL for the   ──►    dedupe by code hash / fingerprint ─► Contents API
latest accepted submission             analyze → classify → choose path     (commit file,
                                       commit, update stats & index          READMEs)
```

- The **content script** uses LeetCode's own GraphQL API with the user's
  session (immune to the page's CSP and DOM changes) and forwards each new
  accepted submission.
- The **service worker** is the single authority for syncing: it identifies
  the solution by a normalized code hash (plus a MinHash fingerprint for
  near-duplicates), runs the analyzer, decides the target path, commits with
  retries and keeps a local index used for classification and READMEs.
- The **popup** shows the open problem's solutions and lets you name, rename
  and annotate them; the **options page** holds all settings.

The token and settings are stored only in `chrome.storage.local`; the
extension talks to nothing except `leetcode.com` and `api.github.com`.

## Tech stack

- Chrome Extension Manifest V3 (service worker, content script, `chrome.storage`,
  `chrome.scripting`, notifications)
- TypeScript (strict)
- Vite + [`@crxjs/vite-plugin`](https://crxjs.dev/vite-plugin)
- GitHub REST API (Contents API), LeetCode GraphQL API
- Node's built-in test runner (`node --test`)

## Project structure

```
src/
  background/   # service worker: sync pipeline, renames, READMEs, message routing
  content/      # runs on leetcode.com: detects accepted submissions
  popup/        # toolbar popup: status, stats, solutions list and editor
  options/      # settings page
  github/       # GitHub REST API wrapper with typed errors
  storage/      # typed chrome.storage.local wrapper
  parser/       # LeetCode GraphQL queries → typed Submission
  utils/        # analyzer, classifier, solution identity, paths, READMEs, stats
  types/        # shared TypeScript types
  manifest.ts   # Manifest V3 (authored in TS via defineManifest)
tests/          # unit tests for the pure modules
```

## Development

```bash
npm install
npm run dev        # Vite dev build with HMR (load dist/ as unpacked)
npm run build      # type-check + production build to dist/
npm run typecheck  # tsc --noEmit
npm test           # unit tests: analyzer, classification, paths, READMEs, stats
```
