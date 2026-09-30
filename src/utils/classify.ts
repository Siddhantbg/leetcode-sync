/**
 * Automatic classification of a problem's solutions.
 *
 * Labels are metadata derived from objective signals, recomputed whenever a
 * solution is added or edited:
 *   - When every solution has a known time complexity and they differ:
 *       best → "Optimal", worst (quadratic or worse) → "Brute Force",
 *       anything in between → "Better".
 *   - Equal time but different known space: least space → "Optimal".
 *   - Otherwise no ranking is claimed: recursive/iterative when that is the
 *     only visible difference, else "Primary" / "Solution N".
 * User-assigned labels (labelSource "user") are never overwritten.
 */
import type { SolutionApproach } from '@/types';

/** Rank ≥ this is quadratic or worse (eligible for "Brute Force"). */
const QUADRATIC = 40;

/**
 * Ordinal rank of a Big-O expression (lower is better), or null when it can't
 * be compared reliably (e.g. "O(n·k)", "O(n log k)").
 */
export function complexityRank(value: string | undefined | null): number | null {
  if (!value) return null;
  let s = value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/[·×∙]/g, '*')
    .replace(/√/g, 'sqrt');
  const wrapped = /^(?:o|θ|big-?o)\((.*)\)$/.exec(s);
  if (wrapped) s = wrapped[1]!;
  s = s.replace(/log\(([a-z])\)/g, 'log$1').replace(/\blg/g, 'log').replace(/\*log/g, 'log');

  const v = '[a-z]';
  // Products only rank as polynomial for input-size variables; "n·k" is left
  // unranked because k is often a small parameter.
  const size = '[mnrc]';
  const table: Array<[RegExp, number]> = [
    [/^1$/, 0],
    [/^logn$/, 10],
    [/^sqrt\(?n\)?$/, 15],
    [new RegExp(`^n$|^${v}(?:\\+${v})+$`), 20],
    [/^nlogn$/, 30],
    [new RegExp(`^n\\^2$|^n\\*n$|^n2$|^${size}\\*${size}$`), 40],
    [/^n\^2logn$/, 45],
    [new RegExp(`^n\\^3$|^n\\*n\\*n$|^${size}\\*${size}\\*${size}$`), 50],
    [/^2\^n$/, 70],
    [/^n\*?2\^n$/, 75],
    [/^n!$/, 80],
    [/^n\*?n!$/, 85],
  ];
  for (const [re, rank] of table) if (re.test(s)) return rank;

  const power = /^n\^(\d+)$/.exec(s);
  if (power) return 50 + (Number(power[1]) - 3) * 5;
  return null;
}

/** "brute-force" → "Brute Force". */
export function prettifyApproach(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Automatic folder slug for additional solutions. */
export function isAutoSlug(approach: string | undefined): boolean {
  return approach != null && /^solution-\d+$/.test(approach);
}

/** Label to show for a solution, even if classification hasn't run yet. */
export function displayLabel(s: SolutionApproach): string {
  if (s.label) return s.label;
  if (!s.approach) return 'Primary';
  const n = /^solution-(\d+)$/.exec(s.approach);
  return n ? `Solution ${n[1]}` : prettifyApproach(s.approach);
}

function createdAt(s: SolutionApproach): number {
  return s.createdAt ?? s.syncedAt;
}

/** Parse "3 ms" / "1.2 s" into milliseconds. */
function runtimeMs(runtime: string | undefined): number | null {
  const m = /([\d.]+)\s*(ms|s)\b/i.exec(runtime ?? '');
  if (!m) return null;
  return Number(m[1]) * (m[2]!.toLowerCase() === 's' ? 1000 : 1);
}

/**
 * Objective ordering: time, then space, then (same language only) measured
 * runtime, then submission order. Runtime never outranks complexity.
 */
function compareSolutions(a: SolutionApproach, b: SolutionApproach): number {
  const ta = complexityRank(a.timeComplexity) ?? Infinity;
  const tb = complexityRank(b.timeComplexity) ?? Infinity;
  if (ta !== tb) return ta - tb;
  const sa = complexityRank(a.spaceComplexity) ?? Infinity;
  const sb = complexityRank(b.spaceComplexity) ?? Infinity;
  if (sa !== sb) return sa - sb;
  if (a.language === b.language) {
    const ra = runtimeMs(a.runtime);
    const rb = runtimeMs(b.runtime);
    if (ra != null && rb != null && ra !== rb) return ra - rb;
  }
  return createdAt(a) - createdAt(b);
}

export interface Classification {
  solutions: SolutionApproach[];
  /** Objectively best solution, when determinable. */
  bestKey?: string;
}

/** Recompute auto labels and the best solution for one problem. */
export function classifySolutions(input: SolutionApproach[]): Classification {
  const solutions = input.map((s) => ({ ...s }));
  if (solutions.length === 0) return { solutions };

  for (const s of solutions) {
    if (s.labelSource === 'user' && !s.label && s.approach) {
      s.label = prettifyApproach(s.approach);
    }
  }

  const time = new Map(solutions.map((s) => [s.key, complexityRank(s.timeComplexity)]));
  const space = new Map(solutions.map((s) => [s.key, complexityRank(s.spaceComplexity)]));
  const allTimeKnown = solutions.every((s) => time.get(s.key) != null);
  const allSpaceKnown = solutions.every((s) => space.get(s.key) != null);
  const distinctTimes = new Set(time.values()).size;
  const distinctSpaces = new Set(space.values()).size;

  let bestKey: string | undefined;
  if (solutions.length === 1) {
    bestKey = solutions[0]!.key;
  } else if (allTimeKnown) {
    bestKey = [...solutions].sort(compareSolutions)[0]!.key;
  } else {
    bestKey = [...solutions]
      .sort((a, b) => createdAt(a) - createdAt(b))
      .find((s) => s.labelSource === 'user' && /\b(?:optimal|best)\b/i.test(s.label ?? ''))?.key;
  }

  const auto = solutions.filter((s) => s.labelSource !== 'user');
  const setLabel = (s: SolutionApproach, label: string) => {
    s.label = label;
    s.labelSource = 'auto';
  };

  if (solutions.length === 1) {
    for (const s of auto) setLabel(s, 'Primary');
    return { solutions, bestKey };
  }

  const byTime = allTimeKnown && distinctTimes > 1;
  const bySpace = allTimeKnown && distinctTimes === 1 && allSpaceKnown && distinctSpaces > 1;

  if (byTime || bySpace) {
    const rankOf = (s: SolutionApproach) => (byTime ? time.get(s.key)! : space.get(s.key)!);
    const ranks = solutions.map(rankOf);
    const best = Math.min(...ranks);
    const worst = Math.max(...ranks);

    // Within one language, only the top candidate at the best rank is "Optimal".
    const optimalByLanguage = new Map<string, string>();
    for (const s of [...solutions].sort(compareSolutions)) {
      if (rankOf(s) === best && !optimalByLanguage.has(s.language)) {
        optimalByLanguage.set(s.language, s.key);
      }
    }

    for (const s of auto) {
      const r = rankOf(s);
      if (r === best) {
        setLabel(s, optimalByLanguage.get(s.language) === s.key ? 'Optimal' : 'Alternative');
      } else if (byTime && r === worst && r >= QUADRATIC) {
        setLabel(s, 'Brute Force');
      } else {
        setLabel(s, byTime ? 'Better' : 'Alternative');
      }
    }
    return { solutions, bestKey };
  }

  // No reliable ranking. Recursive vs iterative is an observable fact, so use
  // it when a language has both styles; otherwise fall back to neutral names.
  const used = new Set<string>();
  const byLanguage = new Map<string, SolutionApproach[]>();
  for (const s of auto) {
    byLanguage.set(s.language, [...(byLanguage.get(s.language) ?? []), s]);
  }
  for (const group of byLanguage.values()) {
    const styles = new Set(group.map((s) => s.analysis?.style).filter(Boolean));
    const ordered = [...group].sort((a, b) => createdAt(a) - createdAt(b));
    for (const s of ordered) {
      const style = s.analysis?.style;
      const styleLabel = style === 'recursive' ? 'Recursive' : style === 'iterative' ? 'Iterative' : null;
      const key = `${s.language}:${styleLabel}`;
      if (styles.size > 1 && styleLabel && !used.has(key)) {
        used.add(key);
        setLabel(s, styleLabel);
      } else {
        setLabel(s, displayLabel({ ...s, label: undefined }));
      }
    }
  }
  return { solutions, bestKey };
}
