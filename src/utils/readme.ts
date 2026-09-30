import type {
  ProblemIndex,
  Settings,
  SolutionApproach,
  SolvedProblem,
  Stats,
} from '@/types';
import { displayLabel } from './classify';
import { localDateKey } from './format';
import { orderForDisplay } from './solution';

const DASH = '—';

/**
 * Build a relative markdown link from the README's location to a solution file.
 * The README lives at `<rootFolder>/README.md` (or repo root), so we strip the
 * shared root prefix and URL-encode each path segment (spaces, "#", etc.).
 */
function relativeLink(rootFolder: string, path: string): string {
  const prefix = rootFolder ? `${rootFolder}/` : '';
  const rel = prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path;
  return rel.split('/').map(encodeURIComponent).join('/');
}

/** Relative, URL-encoded link from directory `fromDir` to repository path `to`. */
export function linkFrom(fromDir: string[], to: string): string {
  const target = to.split('/').filter(Boolean);
  let common = 0;
  while (
    common < fromDir.length &&
    common < target.length - 1 &&
    fromDir[common] === target[common]
  ) {
    common++;
  }
  const up = fromDir.slice(common).map(() => '..');
  return [...up, ...target.slice(common)].map(encodeURIComponent).join('/');
}

/** Escape pipe characters so problem titles don't break the markdown table. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function isAuto(value: string | undefined, auto: string | undefined): boolean {
  return Boolean(value && auto && value === auto);
}

function complexityText(value: string | undefined, auto: string | undefined): string {
  if (!value) return DASH;
  return isAuto(value, auto) ? `${value} _(auto-detected)_` : value;
}

function titleFor(p: SolvedProblem, s: SolutionApproach): string {
  const star = p.bestKey === s.key && (p.solutions?.length ?? 0) > 1 ? '⭐ ' : '';
  return `${star}${displayLabel(s)}`;
}

/**
 * README beside one solution file (its approach folder, or the problem folder
 * for a lone primary). Same shape as the classic per-problem README.
 */
export function buildApproachReadme(
  p: SolvedProblem,
  s: SolutionApproach,
): string {
  const lines: string[] = [];
  const file = s.path.split('/').pop() ?? s.path;
  const multiple = (p.solutions?.length ?? 0) > 1;

  lines.push(`# ${p.number}. ${p.title}`, '');
  if (multiple || s.approach) lines.push(`- **Solution:** ${titleFor(p, s)}`);
  lines.push(`- **Difficulty:** ${p.difficulty}`);
  lines.push(`- **Link:** [${p.titleSlug}](${p.url})`);
  lines.push(`- **Language:** ${s.language}`);
  lines.push(`- **File:** [\`${file}\`](${encodeURIComponent(file)})`);
  lines.push(`- **Time complexity:** ${complexityText(s.timeComplexity, s.analysis?.timeComplexity)}`);
  lines.push(`- **Space complexity:** ${complexityText(s.spaceComplexity, s.analysis?.spaceComplexity)}`);
  if (s.analysis?.pattern) lines.push(`- **Pattern:** ${s.analysis.pattern}`);
  const runtime = s.runtime ?? p.runtime;
  const memory = s.memory ?? p.memory;
  if (runtime) lines.push(`- **Runtime:** ${runtime}`);
  if (memory) lines.push(`- **Memory:** ${memory}`);
  lines.push('');

  lines.push('## Notes', '');
  lines.push(s.notes && s.notes.trim() ? s.notes.trim() : DASH, '');

  lines.push(`_Last updated: ${localDateKey(new Date(s.syncedAt))}_`);
  return `${lines.join('\n')}\n`;
}

/**
 * Per-problem README.md. With several solutions it is an index (best first,
 * each with complexity, pattern and a link); otherwise the classic README.
 *
 * @param dir Folder the README is written to (for relative links).
 */
export function buildProblemReadme(p: SolvedProblem, dir: string[] = []): string {
  const solutions = orderForDisplay(p);
  const single = solutions.length === 1 ? solutions[0]! : undefined;
  const fileDir = single ? single.path.split('/').slice(0, -1).join('/') : '';
  if (single && dir.length > 0 && dir.join('/') === fileDir) {
    return buildApproachReadme(p, single);
  }
  // A lone solution in its own subfolder gets an index that links into it.
  const asIndex = Boolean(single && dir.length > 0);

  const lines: string[] = [];
  lines.push(`# ${p.number}. ${p.title}`, '');
  lines.push(`- **Difficulty:** ${p.difficulty}`);
  lines.push(`- **Link:** [${p.titleSlug}](${p.url})`);
  lines.push(`- **Language(s):** ${p.languages.join(', ')}`);

  if (solutions.length <= 1 && !asIndex) {
    const s = solutions[0];
    lines.push(`- **Time complexity:** ${complexityText(s?.timeComplexity ?? p.timeComplexity, s?.analysis?.timeComplexity)}`);
    lines.push(`- **Space complexity:** ${complexityText(s?.spaceComplexity ?? p.spaceComplexity, s?.analysis?.spaceComplexity)}`);
    if (p.runtime) lines.push(`- **Runtime:** ${p.runtime}`);
    if (p.memory) lines.push(`- **Memory:** ${p.memory}`);
    lines.push('');
    lines.push('## Notes', '');
    const notes = s?.notes ?? p.notes;
    lines.push(notes && notes.trim() ? notes.trim() : DASH, '');
    lines.push(`_Last updated: ${localDateKey(new Date(p.syncedAt))}_`);
    return `${lines.join('\n')}\n`;
  }

  lines.push(`- **Solutions:** ${solutions.length}`);
  lines.push('');

  const best = solutions.find((s) => s.key === p.bestKey);
  if (best) {
    const time = best.timeComplexity ?? DASH;
    const space = best.spaceComplexity ?? DASH;
    lines.push('## ⭐ Best', '');
    lines.push(`**${displayLabel(best)}** (${best.language}) — ${time} time · ${space} space`, '');
  }

  lines.push('## Solutions', '');
  let autoUsed = false;
  for (const s of solutions) {
    const auto =
      isAuto(s.timeComplexity, s.analysis?.timeComplexity) ||
      isAuto(s.spaceComplexity, s.analysis?.spaceComplexity);
    autoUsed ||= auto;
    const file = s.path.split('/').pop() ?? s.path;
    const relFile = linkFrom(dir, s.path);
    lines.push(`### ${titleFor(p, s)}`, '');
    lines.push(`- **Language:** ${s.language}`);
    lines.push(
      `- **Complexity:** ${s.timeComplexity ?? DASH} time · ${s.spaceComplexity ?? DASH} space${auto ? ' *' : ''}`,
    );
    if (s.analysis?.pattern) lines.push(`- **Pattern:** ${s.analysis.pattern}`);
    if (s.runtime || s.memory) {
      lines.push(`- **LeetCode:** ${[s.runtime, s.memory].filter(Boolean).join(' · ')}`);
    }
    lines.push(`- **File:** [\`${file}\`](${relFile})`);
    if (s.approach) {
      lines.push(`- **Details:** [README](${linkFrom(dir, [...s.path.split('/').slice(0, -1), 'README.md'].join('/'))})`);
    }
    if (s.notes?.trim()) {
      lines.push('', s.notes.trim());
    }
    lines.push('');
  }
  if (autoUsed) {
    lines.push('<sub>* Complexity auto-detected from the code; edit it in the extension popup if it looks off.</sub>', '');
  }

  lines.push(`_Last updated: ${localDateKey(new Date(p.syncedAt))}_`);
  return `${lines.join('\n')}\n`;
}

/** Path the progress table links to: best solution, else primary. */
function primaryLinkPath(p: SolvedProblem): string {
  const solutions = p.solutions ?? [];
  const best = solutions.find((s) => s.key === p.bestKey);
  return best?.path ?? solutions.find((s) => !s.approach)?.path ?? solutions[0]?.path ?? p.path;
}

/** Generate the full README.md content from accumulated stats + problem index. */
export function buildReadme(
  settings: Settings,
  stats: Stats,
  index: ProblemIndex,
): string {
  const problems = Object.values(index).sort((a, b) => a.number - b.number);
  const { Easy, Medium, Hard } = stats.byDifficulty;

  const lines: string[] = [];
  lines.push('# LeetCode Solutions', '');
  lines.push('> Automatically synced with **LeetCode Sync**.', '');

  lines.push('## Progress', '');
  lines.push(`- **Total solved:** ${stats.totalSynced}`);
  lines.push(`- **Easy:** ${Easy} &nbsp;·&nbsp; **Medium:** ${Medium} &nbsp;·&nbsp; **Hard:** ${Hard}`);
  lines.push(
    `- **Current streak:** ${stats.streak.current} day(s) &nbsp;·&nbsp; **Longest:** ${stats.streak.longest}`,
  );
  lines.push('');

  lines.push('## Solutions', '');
  lines.push('| # | Title | Difficulty | Language | Solved |');
  lines.push('| --: | :--- | :---: | :--- | :--- |');
  for (const p of problems) {
    const link = relativeLink(settings.rootFolder, primaryLinkPath(p));
    const date = localDateKey(new Date(p.syncedAt));
    const count = p.solutions?.length ?? 0;
    const extra = count > 1 ? ` (${count} solutions)` : '';
    lines.push(
      `| ${p.number} | [${escapeCell(p.title)}](${link})${extra} | ${p.difficulty} | ${escapeCell(p.languages.join(', '))} | ${date} |`,
    );
  }
  lines.push('');
  lines.push(`_Last updated: ${localDateKey()}_`);

  return `${lines.join('\n')}\n`;
}
