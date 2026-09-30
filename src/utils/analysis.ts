/**
 * Best-effort static analysis of an accepted LeetCode solution: asymptotic
 * time/space complexity, algorithmic pattern and recursive/iterative style.
 *
 * Deliberately conservative. Complexity is only reported when the structure is
 * unambiguous (counted loops, binary-search halving, sorting, well-known
 * allocation idioms). Anything that usually needs amortized or input-specific
 * reasoning — an inner while-loop (sliding window, monotonic stack), work-list
 * loops (BFS), recursion, heaps, ordered maps, helper calls inside loops,
 * operations on a different collection than the loop iterates — leaves the
 * value unset instead of guessing.
 */
import type { SolutionAnalysis } from '@/types';

export const ANALYSIS_VERSION = 1;

const MAX_CODE_LENGTH = 30_000;
/** Loop bounds up to this literal are treated as O(1) (alphabet, bits, dirs). */
const SMALL_LOOP_BOUND = 64;
/** Fixed-size buffers up to this literal are treated as O(1) space. */
const SMALL_ALLOCATION = 256;

type Family = 'python' | 'brace';

const PYTHON_LANGS = new Set(['python', 'python3', 'pythondata', 'pythonml']);
const BRACE_LANGS = new Set([
  'c', 'cpp', 'csharp', 'java', 'javascript', 'typescript', 'php', 'swift',
  'kotlin', 'dart', 'golang', 'go', 'rust', 'scala',
]);
/** Languages whose allocation idioms are covered well enough to claim O(1) space. */
const SPACE_O1_LANGS = new Set([
  'python', 'python3', 'java', 'cpp', 'c', 'csharp', 'javascript', 'typescript',
  'golang', 'go',
]);

export function languageFamily(language: string): Family | null {
  const lang = language.toLowerCase();
  if (PYTHON_LANGS.has(lang)) return 'python';
  if (BRACE_LANGS.has(lang)) return 'brace';
  return null;
}

/* ------------------------------------------------------------------ */
/* Source preprocessing                                                */
/* ------------------------------------------------------------------ */

/**
 * Replace comments with nothing and string literals with `""`, preserving
 * newlines so line structure (Python indentation) survives.
 */
export function stripCommentsAndStrings(code: string, family: Family): string {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i]!;
    const next = code[i + 1];

    if (family === 'python' && ch === '#') {
      while (i < n && code[i] !== '\n') i++;
      continue;
    }
    if (family === 'brace' && ch === '/' && next === '/') {
      while (i < n && code[i] !== '\n') i++;
      continue;
    }
    if (family === 'brace' && ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }

    const isQuote =
      ch === '"' || ch === "'" || (family === 'brace' && ch === '`');
    if (isQuote) {
      const triple = family === 'python' && code.startsWith(ch.repeat(3), i);
      const quote = triple ? ch.repeat(3) : ch;
      const multiline = triple || ch === '`';
      i += quote.length;
      while (i < n && !code.startsWith(quote, i)) {
        if (code[i] === '\\') {
          i += 2;
          continue;
        }
        if (code[i] === '\n') {
          if (!multiline) break;
          out += '\n';
        }
        i++;
      }
      if (code.startsWith(quote, i)) i += quote.length;
      out += '""';
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

/** Remove a metadata comment header added by the "include notes" setting. */
export function stripSyncHeader(content: string): string {
  const lines = content.split('\n');
  if (!/^\s*(?:\/\/|#|--|;|%)\s*\d+\.\s/.test(lines[0] ?? '')) return content;
  let i = 0;
  while (i < lines.length && /^\s*(?:\/\/|#|--|;|%)/.test(lines[i]!)) i++;
  if (i < lines.length && lines[i]!.trim() === '') i++;
  return lines.slice(i).join('\n');
}

/* ------------------------------------------------------------------ */
/* Small text helpers                                                  */
/* ------------------------------------------------------------------ */

const OPEN = '([{';
const CLOSE = ')]}';

/** Index of the bracket matching the one at `open`, or -1. */
function matchBracket(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i]!;
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split on `sep` at bracket depth 0. */
function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) depth--;
    else if (depth === 0 && text.startsWith(sep, i)) {
      parts.push(text.slice(start, i));
      start = i + sep.length;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim());
}

function isNumber(expr: string | undefined): boolean {
  return expr != null && /^\(?\s*-?\d+\s*\)?$/.test(expr.trim());
}

function smallLiteral(expr: string | undefined, limit: number): boolean {
  if (!isNumber(expr)) return false;
  return Math.abs(Number(expr!.replace(/[()\s]/g, ''))) <= limit;
}

const NON_ROOT_WORDS = new Set([
  'len', 'int', 'range', 'math', 'Math', 'floor', 'ceil', 'size', 'length',
  'count', 'strlen', 'sizeof', 'min', 'max', 'abs', 'self', 'this', 'sqrt',
  'enumerate', 'reversed', 'list', 'zip', 'Arrays', 'stream', 'indices',
  'chars', 'iter', 'into_iter', 'rev', 'Count', 'Length', 'len_', 'uint',
  'long', 'auto', 'const', 'let', 'var', 'val', 'final',
]);

/** Leading identifier of an expression, ignoring wrappers like len()/.length. */
function rootIdentifier(expr: string | undefined): string | undefined {
  if (!expr) return undefined;
  const re = /[A-Za-z_$][\w$]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr))) {
    const word = m[0].replace(/^\$/, '');
    if (!NON_ROOT_WORDS.has(word)) return word;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Structure model                                                     */
/* ------------------------------------------------------------------ */

interface Range {
  start: number;
  end: number;
}

type LoopKind = 'linear' | 'log' | 'constant' | 'unknown';

interface Loop {
  idx: number;
  /** Position of the loop keyword / iteration call. */
  pos: number;
  body: Range;
  kind: LoopKind;
  isWhile: boolean;
  reverse: boolean;
  variable?: string;
  /** Upper bound / iterated collection expression. */
  bound?: string;
  /** Start / init expression (dependency on an outer loop variable). */
  start?: string;
  header: string;
}

interface Func {
  name: string;
  /** Position of the name in the definition (excluded from call search). */
  namePos: number;
  body: Range;
  decorators: string;
}

interface LoopShape {
  kind: LoopKind;
  reverse: boolean;
  variable?: string;
  bound?: string;
  start?: string;
}

const DIR_NAMES =
  /^(?:dirs?|directions?|moves|deltas|offsets|neighbou?r_?offsets|dxy|dydx|adj4|adj8)$/i;

/* ------------------------------ Python ------------------------------ */

function indentWidth(line: string): number {
  let w = 0;
  for (const ch of line) {
    if (ch === ' ') w++;
    else if (ch === '\t') w += 4;
    else break;
  }
  return w;
}

function pythonForShape(header: string): LoopShape {
  const m = /^\s*(.+?)\s+in\s+([\s\S]+)$/.exec(header);
  if (!m) return { kind: 'linear', reverse: false };
  const variable = /[A-Za-z_]\w*/.exec(m[1]!)?.[0];
  let expr = m[2]!.trim();
  let reverse = /\breversed\s*\(|\[\s*::\s*-1\s*\]/.test(expr);

  const unwrap = /^(?:reversed|enumerate|list|zip|iter)\s*\(([\s\S]*)\)$/;
  let u: RegExpExecArray | null;
  while ((u = unwrap.exec(expr))) expr = splitTopLevel(u[1]!, ',')[0]!;

  const range = /^range\s*\(([\s\S]*)\)$/.exec(expr);
  if (range) {
    const args = splitTopLevel(range[1]!, ',');
    let start = args.length > 1 ? args[0] : '0';
    let bound = args.length > 1 ? args[1] : args[0];
    const step = args[2];
    if (step && /^-/.test(step)) {
      reverse = true;
      [start, bound] = [bound, start];
    }
    const constant =
      smallLiteral(bound, SMALL_LOOP_BOUND) &&
      smallLiteral(start, SMALL_LOOP_BOUND);
    return { kind: constant ? 'constant' : 'linear', reverse, variable, bound, start };
  }

  if (DIR_NAMES.test(expr) || /^[[(]/.test(expr) || expr === '""') {
    return { kind: 'constant', reverse, variable, bound: expr };
  }
  return { kind: 'linear', reverse, variable, bound: expr };
}

function parsePython(src: string): { loops: Loop[]; funcs: Func[] } {
  const loops: Loop[] = [];
  const funcs: Func[] = [];
  const lines = src.split('\n');
  const offsets: number[] = [];
  let acc = 0;
  for (const line of lines) {
    offsets.push(acc);
    acc += line.length + 1;
  }
  const lineOf = (pos: number): number => {
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid]! <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trimStart();
    const m = /^(?:async\s+)?(for|while|def)\b\s*(\w*)/.exec(trimmed);
    if (!m) continue;

    const kwPos = offsets[i]! + (line.length - trimmed.length);
    const headerStart = kwPos + trimmed.indexOf(m[1]!) + m[1]!.length;

    // Header ends at the first ':' at bracket depth 0 (may span lines).
    let depth = 0;
    let colon = -1;
    for (let p = headerStart; p < src.length; p++) {
      const ch = src[p]!;
      if (OPEN.includes(ch)) depth++;
      else if (CLOSE.includes(ch)) depth--;
      else if (ch === ':' && depth === 0) {
        colon = p;
        break;
      } else if (ch === '\n' && depth === 0) break;
    }
    if (colon < 0) continue;

    const header = src.slice(headerStart, colon).trim();
    const colonLine = lineOf(colon);
    const lineEnd = offsets[colonLine]! + lines[colonLine]!.length;
    const inline = src.slice(colon + 1, lineEnd).trim();

    let body: Range;
    if (inline) {
      body = { start: colon + 1, end: lineEnd };
    } else {
      const indent = indentWidth(line);
      let last = colonLine;
      for (let j = colonLine + 1; j < lines.length; j++) {
        const t = lines[j]!;
        if (t.trim() === '') continue;
        if (indentWidth(t) <= indent) break;
        last = j;
      }
      body = {
        start: offsets[colonLine + 1] ?? lineEnd,
        end: offsets[last]! + lines[last]!.length,
      };
      if (last === colonLine) body = { start: lineEnd, end: lineEnd };
    }

    if (m[1] === 'def') {
      let decorators = '';
      for (let j = i - 1; j >= 0 && lines[j]!.trim().startsWith('@'); j--) {
        decorators += lines[j]!.trim() + ' ';
      }
      funcs.push({
        name: m[2]!,
        namePos: kwPos + trimmed.indexOf(m[2]!),
        body,
        decorators,
      });
    } else {
      const isWhile = m[1] === 'while';
      const shape = isWhile
        ? { kind: 'linear' as LoopKind, reverse: false }
        : pythonForShape(header);
      loops.push({
        idx: loops.length,
        pos: kwPos,
        body,
        isWhile,
        header,
        ...shape,
      });
    }
  }

  // Comprehension / generator loops: `for` inside a bracket group. The whole
  // group is the loop body (the element expression precedes the `for`).
  const stack: number[] = [];
  const pending: Array<{ pos: number; group: number }> = [];
  const closeOf = new Map<number, number>();
  for (let p = 0; p < src.length; p++) {
    const ch = src[p]!;
    if (OPEN.includes(ch)) stack.push(p);
    else if (CLOSE.includes(ch)) {
      const open = stack.pop();
      if (open != null) closeOf.set(open, p);
    } else if (
      stack.length > 0 &&
      src.startsWith('for', p) &&
      !/\w/.test(src[p - 1] ?? '') &&
      !/\w/.test(src[p + 3] ?? '')
    ) {
      pending.push({ pos: p, group: stack[stack.length - 1]! });
    }
  }
  for (const c of pending) {
    const close = closeOf.get(c.group);
    if (close == null) continue;
    const rest = src.slice(c.pos + 3, close);
    const header = rest.split(/\b(?:for|if)\b/)[0]!.trim();
    loops.push({
      idx: loops.length,
      pos: c.pos,
      body: { start: c.group, end: close + 1 },
      isWhile: false,
      header,
      ...pythonForShape(header),
    });
  }

  return { loops, funcs };
}

/* ---------------------------- Brace family ---------------------------- */

function braceForShape(header: string): LoopShape {
  const parts = splitTopLevel(header, ';');
  if (parts.length === 3) {
    const [init, cond, step] = parts as [string, string, string];
    const iv = /\$?([A-Za-z_]\w*)\s*(?::=|=)\s*([^,]+)/.exec(init);
    const variable = iv?.[1];
    const initVal = iv?.[2]?.trim();
    const reverse = /--|-=/.test(step);

    if (/\w\s*\*\s*\w+\s*<=?/.test(cond)) {
      return { kind: 'unknown', reverse, variable, start: initVal }; // sqrt-style
    }
    if (/(?:\*|\/|<<|>>>?)=|=\s*\w+\s*[*/]\s*\d|>>>?\s*1|<<\s*1/.test(step)) {
      return { kind: 'log', reverse, variable, start: initVal };
    }

    const cmp = /(<=|>=|<|>|!=)\s*([^&|]+)/.exec(cond);
    let bound: string | undefined;
    let start = initVal;
    if (cmp) {
      if (cmp[1] === '>' || cmp[1] === '>=') {
        bound = initVal;
        start = cmp[2]!.trim();
      } else {
        bound = cmp[2]!.trim();
      }
    }
    const constant =
      smallLiteral(bound, SMALL_LOOP_BOUND) &&
      (start == null || smallLiteral(start, SMALL_LOOP_BOUND));
    return {
      kind: constant ? 'constant' : cmp ? 'linear' : 'unknown',
      reverse,
      variable,
      bound,
      start,
    };
  }

  // Go: `i, x := range expr` / `range n`.
  const go = /^\s*(?:([A-Za-z_]\w*)\s*(?:,\s*([A-Za-z_]\w*))?\s*:?=\s*)?range\s+([\s\S]+)$/.exec(header);
  let variable: string | undefined;
  let expr: string;
  if (go) {
    variable = go[2] ?? go[1];
    expr = go[3]!.trim();
  } else {
    const php = /^\s*\$?([A-Za-z_]\w*)\s+as\s+/.exec(header);
    if (php) {
      expr = php[1]!;
    } else {
      const sep = /\s(?:in|of)\s|(?<!:):(?!:)|<-/.exec(header);
      if (!sep) return { kind: 'unknown', reverse: false };
      const left = header.slice(0, sep.index);
      variable = /([A-Za-z_]\w*)\s*[\])]?\s*$/.exec(left)?.[1];
      expr = header.slice(sep.index + sep[0].length).trim();
    }
  }

  let reverse = /\.rev\(\)|\.reversed\(\)|\breversed\s*\(|\bdownTo\b|\.Reverse\(\)/.test(expr);

  const stride = /stride\s*\(\s*from:\s*([^,]+),\s*(?:to|through):\s*([^,]+),\s*by:\s*([^)]+)\)/.exec(expr);
  if (stride) {
    const negative = /^\s*-/.test(stride[3]!);
    if (negative) reverse = true;
    const bound = negative ? stride[1]!.trim() : stride[2]!.trim();
    const start = negative ? stride[2]!.trim() : stride[1]!.trim();
    const constant = smallLiteral(bound, SMALL_LOOP_BOUND) && smallLiteral(start, SMALL_LOOP_BOUND);
    return { kind: constant ? 'constant' : 'linear', reverse, variable, bound, start };
  }

  const range =
    /^\(?\s*([^.]+?)\s*(\.\.<|\.\.\.|\.\.=|\.\.|\buntil\b|\bdownTo\b)\s*([^)]+?)\s*\)?(?:\.rev\(\)|\.reversed\(\))?(?:\s+step\s+\S+)?$/.exec(expr);
  if (range) {
    const down = range[2] === 'downTo';
    const bound = down ? range[1]!.trim() : range[3]!.trim();
    const start = down ? range[3]!.trim() : range[1]!.trim();
    const constant = smallLiteral(bound, SMALL_LOOP_BOUND) && smallLiteral(start, SMALL_LOOP_BOUND);
    return { kind: constant ? 'constant' : 'linear', reverse, variable, bound, start };
  }

  if (isNumber(expr)) {
    return {
      kind: smallLiteral(expr, SMALL_LOOP_BOUND) ? 'constant' : 'linear',
      reverse,
      variable,
      bound: expr,
    };
  }

  const literal =
    /^(?:new\s+[\w<>]+\s*\[\s*\]\s*(?:\[\s*\]\s*)*)?\{\s*[{\d-]|^\[\s*[[(\d-]|^(?:arrayOf|listOf|intArrayOf)\s*\(/.test(expr) ||
    expr === '""';
  const bare = rootIdentifier(expr);
  if (literal || (bare && DIR_NAMES.test(bare) && !/[.(]/.test(expr))) {
    return { kind: 'constant', reverse, variable, bound: expr };
  }
  return { kind: 'linear', reverse, variable, bound: expr };
}

const BRACE_KEYWORDS = new Set([
  'if', 'for', 'foreach', 'while', 'switch', 'catch', 'return', 'sizeof',
  'synchronized', 'using', 'lock', 'fixed', 'when', 'else', 'do', 'try',
  'new', 'function', 'func', 'fun', 'fn', 'def', 'super', 'this', 'match',
  'loop', 'repeat', 'guard', 'defer', 'select', 'typeof', 'await',
]);

function parseBrace(src: string, language: string): { loops: Loop[]; funcs: Func[] } {
  const loops: Loop[] = [];
  const funcs: Func[] = [];

  /** Body after a header: `{...}` block, or a single statement up to `;`. */
  const bodyAfter = (from: number): Range | null => {
    let b = from;
    while (b < src.length && /\s/.test(src[b]!)) b++;
    if (src[b] === ';') return null;
    if (src[b] === '{') {
      const close = matchBracket(src, b);
      return close < 0 ? null : { start: b + 1, end: close };
    }
    let depth = 0;
    for (let p = b; p < src.length; p++) {
      const ch = src[p]!;
      if (OPEN.includes(ch)) depth++;
      else if (CLOSE.includes(ch)) {
        if (depth === 0) return { start: b, end: p };
        depth--;
        if (depth === 0 && ch === '}') {
          const rest = src.slice(p + 1).match(/^\s*(;|else\b)?/);
          if (!rest?.[1]) return { start: b, end: p + 1 };
        }
      } else if (ch === ';' && depth === 0) return { start: b, end: p + 1 };
    }
    return { start: b, end: src.length };
  };

  const loopRe = /\b(for|foreach|while|do|loop|repeat)\b/g;
  let m: RegExpExecArray | null;
  while ((m = loopRe.exec(src))) {
    const kw = m[1]!;
    let p = m.index + kw.length;
    while (p < src.length && /[ \t]/.test(src[p]!)) p++;

    if (kw === 'do' || kw === 'loop' || (kw === 'repeat' && src[p] === '{')) {
      if (src[p] !== '{') continue;
      const close = matchBracket(src, p);
      if (close < 0) continue;
      loops.push({
        idx: loops.length, pos: m.index, body: { start: p + 1, end: close },
        kind: 'unknown', isWhile: true, reverse: false, header: '',
      });
      continue;
    }

    let header: string;
    let after: number;
    if (src[p] === '(') {
      const close = matchBracket(src, p);
      if (close < 0) continue;
      header = src.slice(p + 1, close);
      after = close + 1;
    } else {
      let depth = 0;
      let q = p;
      let valid = false;
      for (; q < src.length; q++) {
        const ch = src[q]!;
        if (ch === '{' && depth === 0) {
          valid = true;
          break;
        }
        if ('(['.includes(ch)) depth++;
        else if (')]'.includes(ch)) depth--;
        else if ((ch === '\n' || ch === ';') && depth === 0) break;
      }
      if (!valid) continue; // do/repeat-while tail
      header = src.slice(p, q);
      after = q;
    }

    const body = bodyAfter(after);
    if (!body) continue;

    // Go spells `while cond {` as `for cond {`.
    const goWhile =
      kw === 'for' &&
      (language === 'golang' || language === 'go') &&
      header.trim() !== '' &&
      !header.includes(';') &&
      !/\brange\b/.test(header);
    const isWhile = kw === 'while' || goWhile;
    const shape: LoopShape = isWhile
      ? { kind: 'linear', reverse: false }
      : kw === 'repeat'
        ? { kind: smallLiteral(header, SMALL_LOOP_BOUND) ? 'constant' : 'linear', reverse: false, bound: header }
        : braceForShape(header);
    loops.push({ idx: loops.length, pos: m.index, body, isWhile, header: header.trim(), ...shape });
  }

  // Higher-order iteration (forEach/map/filter/…) counts as a loop.
  const iterNames = [
    'forEach', 'map', 'filter', 'reduce', 'reduceRight', 'some', 'every',
    'flatMap', 'for_each', 'fold', 'forEachIndexed', 'mapIndexed', 'sumOf',
    'any', 'all', 'none', 'filterNot', 'mapNotNull', 'Select', 'Where',
  ];
  if (language === 'javascript' || language === 'typescript') {
    iterNames.push('find', 'findIndex', 'findLast');
  }
  if (language !== 'cpp') iterNames.push('count');
  const iterRe = new RegExp(`\\.(${iterNames.join('|')})\\s*(?=[({])`, 'g');
  while ((m = iterRe.exec(src))) {
    const open = m.index + m[0].length;
    const close = matchBracket(src, open);
    if (close < 0) continue;
    const receiver = src.slice(Math.max(0, m.index - 80), m.index);
    const arg = /\(\s*([A-Za-z_]\w*)\s*\)\s*$/.exec(receiver)?.[1];
    const bound = arg ?? /([A-Za-z_][\w.[\]]*)\s*$/.exec(receiver)?.[1];
    loops.push({
      idx: loops.length, pos: m.index, body: { start: open, end: close + 1 },
      kind: 'linear', isWhile: false, reverse: false, bound, header: m[1]!,
    });
  }

  const addFunc = (name: string, namePos: number, searchFrom: number): void => {
    if (!name || BRACE_KEYWORDS.has(name)) return;
    const window = src.slice(searchFrom, searchFrom + 400);
    const brace = window.search(/[{;]/);
    if (brace < 0) return;
    if (window[brace] === ';') {
      // Arrow function without a block body: `const f = (x) => expr;`
      funcs.push({ name, namePos, body: { start: searchFrom, end: searchFrom + brace }, decorators: '' });
      return;
    }
    const open = searchFrom + brace;
    const close = matchBracket(src, open);
    if (close < 0) return;
    funcs.push({ name, namePos, body: { start: open + 1, end: close }, decorators: '' });
  };

  const keywordFn =
    /\b(?:function\s*\*?|func\s+(?:\([^)]*\)\s*)?|fun\s+(?:<[^>]*>\s*)?(?:\w+\.)?|fn\s+|def\s+)([A-Za-z_]\w*)/g;
  while ((m = keywordFn.exec(src))) {
    addFunc(m[1]!, m.index + m[0].length - m[1]!.length, m.index + m[0].length);
  }

  const cMethod =
    /(?<![.\w])(?<!new\s)([A-Za-z_]\w*)\s*\(((?:[^(){};]|\([^()]*\))*)\)\s*(?:const\s*)?(?:noexcept\s*)?(?:throws\s+[\w.,\s]+)?(?:->\s*[\w<>:,\s*&]+)?(?=\{)/g;
  while ((m = cMethod.exec(src))) {
    const name = m[1]!;
    if (BRACE_KEYWORDS.has(name) || funcs.some((f) => f.namePos === m!.index)) continue;
    addFunc(name, m.index, m.index + m[0].length);
  }

  const lambdas = [
    /\b([A-Za-z_]\w*)\s*=\s*\[[^\]]*\]\s*\(/g, // C++ lambda
    /\bfunction\s*<[^>]*>\s*([A-Za-z_]\w*)\s*=/g, // std::function
    /\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_]\w*)\s*(?::[^=]+)?=>/g,
    /\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*function\b/g,
  ];
  for (const re of lambdas) {
    while ((m = re.exec(src))) {
      const namePos = m.index + m[0].indexOf(m[1]!);
      if (funcs.some((f) => f.namePos === namePos)) continue;
      addFunc(m[1]!, namePos, m.index + m[0].length);
    }
  }

  return { loops, funcs };
}

/* ------------------------------------------------------------------ */
/* Operations with hidden cost                                         */
/* ------------------------------------------------------------------ */

interface CostOp {
  pos: number;
  factor: 'linear' | 'log' | 'nlogn';
  /** Collection the op works on (to relate it to the enclosing loop). */
  subject?: string;
  /** True when we can't tell whether the op is O(1) or O(n). */
  ambiguous?: boolean;
}

type ReceiverKind = 'hash' | 'linear' | 'unknown';

function receiverKind(src: string, family: Family, name: string): ReceiverKind {
  const n = name.replace(/[$]/g, '\\$');
  if (family === 'python') {
    if (new RegExp(`\\b${n}\\s*(?::[^=\\n]*)?=\\s*(?:set\\(|frozenset\\(|dict\\(|\\{|defaultdict\\(|Counter\\(|collections\\.|OrderedDict\\()`).test(src)) return 'hash';
    if (new RegExp(`\\b${n}\\s*(?::[^=\\n]*)?=\\s*(?:\\[|list\\(|""|str\\()`).test(src)) return 'linear';
    return 'unknown';
  }
  if (
    new RegExp(`\\b(?:Set|HashSet|LinkedHashSet|Map|HashMap|LinkedHashMap|unordered_set|unordered_map|Dictionary|MutableSet|MutableMap)\\b[^;=\\n]*\\b${n}\\b`).test(src) ||
    new RegExp(`\\b${n}\\s*(?::[^=\\n]*)?:?=\\s*(?:new\\s+(?:Set|Map|HashSet|HashMap|LinkedHashMap|LinkedHashSet|Dictionary)\\b|make\\(\\s*map|map\\[|mutableSetOf|mutableMapOf|hashSetOf|hashMapOf|HashSet\\(|HashMap\\()`).test(src)
  ) return 'hash';
  if (
    new RegExp(`\\b(?:List|ArrayList|LinkedList|vector|String|string|StringBuilder|Array|Vec)\\b[^;=\\n]*\\b${n}\\b`).test(src) ||
    new RegExp(`\\b${n}\\s*(?::[^=\\n]*)?=\\s*(?:\\[|new\\s+(?:ArrayList|LinkedList|Array)|Arrays\\.asList|""|mutableListOf)`).test(src)
  ) return 'linear';
  return 'unknown';
}

/** Collect sorts, binary searches and hidden-linear library operations. */
function collectCostOps(src: string, family: Family, language: string): CostOp[] {
  const ops: CostOp[] = [];
  /** `func reverse(...)` / `void reverse(...) {` declare a helper; they are not library calls. */
  const isDeclaration = (m: RegExpExecArray): boolean => {
    if (/\b(?:func|function|def|fun|fn)\s+(?:\([^)]*\)\s*)?$/.test(src.slice(Math.max(0, m.index - 80), m.index))) {
      return true;
    }
    const open = src.indexOf('(', m.index);
    if (open < 0 || open >= m.index + m[0].length) return false;
    const close = matchBracket(src, open);
    return close >= 0 && /^\s*(?:const\s*)?(?:noexcept\s*)?(?:override\s*)?\{/.test(src.slice(close + 1, close + 40));
  };
  const add = (re: RegExp, factor: CostOp['factor'], subjectOf?: (m: RegExpExecArray) => string | undefined) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (isDeclaration(m)) continue;
      ops.push({ pos: m.index, factor, subject: subjectOf?.(m) });
    }
  };
  const argAfter = (m: RegExpExecArray): string | undefined =>
    rootIdentifier(src.slice(m.index + m[0].length, m.index + m[0].length + 60));
  const receiverBefore = (m: RegExpExecArray): string | undefined =>
    /([A-Za-z_]\w*)\s*(?:\[[^\]]*\]|\(\))?\s*$/.exec(src.slice(Math.max(0, m.index - 60), m.index))?.[1];

  // Sorting (n log n).
  add(
    /\bsorted\s*\(|\b(?:Arrays|Collections|Array)\.[sS]ort\s*\(|\bqsort\s*\(|\bsort\.(?:Ints|Strings|Slice|SliceStable|Float64s)\s*\(|\bslices\.Sort(?:Func)?\s*\(|(?<![.\w])(?:std::)?sort\s*\(/g,
    'nlogn',
    argAfter,
  );
  add(/\.(?:sort|sorted|sort_unstable|sort_by|sort_unstable_by|sort_by_key|sortBy|sortWith|sortedBy|OrderBy|OrderByDescending)\s*(?=[({])/g, 'nlogn', receiverBefore);

  // Binary search (log n).
  add(/\b(?:bisect_left|bisect_right|bisect|binarySearch|BinarySearch|lower_bound|upper_bound|equal_range|binary_search)\s*\(|\bsort\.Search\w*\s*\(/g, 'log');

  if (family === 'python') {
    add(/\.(?:index|count|copy)\s*\(|\.pop\s*\(\s*0\s*\)|\.insert\s*\(/g, 'linear', receiverBefore);
    add(/\.join\s*\(/g, 'linear', argAfter);
    add(/\b[A-Za-z_]\w*\s*\[[^\][:]*:[^\]]*\]/g, 'linear', (m) => rootIdentifier(m[0]));
    add(/(?<![\w\])])\[[^\][]*\]\s*\*\s*(?=[A-Za-z_(])/g, 'linear', argAfter); // [0] * n

    // Builtins consuming an iterable. A generator argument is already counted
    // as a comprehension loop, so skip those.
    const builtin = /\b(?:sum|list|tuple|Counter|deepcopy|set)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = builtin.exec(src))) {
      if (/[\w.]$/.test(src.slice(0, m.index))) continue;
      const open = m.index + m[0].length - 1;
      const close = matchBracket(src, open);
      const arg = close < 0 ? '' : src.slice(open + 1, close).trim();
      if (!arg || /\bfor\b/.test(arg)) continue;
      ops.push({ pos: m.index, factor: 'linear', subject: rootIdentifier(arg) });
    }

    // max/min over an iterable (single argument) is linear; two args is O(1).
    const mm = /\b(?:max|min)\s*\(/g;
    while ((m = mm.exec(src))) {
      const open = m.index + m[0].length - 1;
      const close = matchBracket(src, open);
      if (close < 0) continue;
      const args = splitTopLevel(src.slice(open + 1, close), ',');
      const first = args[0] ?? '';
      if (args.length === 1 || (args.length === 2 && /^key\s*=/.test(args[1]!))) {
        if (!isNumber(first) && !/\bfor\b/.test(first)) {
          ops.push({ pos: m.index, factor: 'linear', subject: rootIdentifier(first) });
        }
      }
    }

    // `x in coll` / `.remove(x)`: O(1) for sets/dicts, O(n) for lists/strings.
    const inRe = /\b(?:not\s+)?in\s+([A-Za-z_]\w*)\b(?!\s*[.([])/g;
    while ((m = inRe.exec(src))) {
      const before = src.slice(Math.max(0, m.index - 60), m.index);
      if (/\bfor\s+(?:(?!\bin\b)[\w\s,()[\]])+$/.test(before)) continue;
      const kind = receiverKind(src, family, m[1]!);
      if (kind === 'hash') continue;
      ops.push({ pos: m.index, factor: 'linear', subject: m[1], ambiguous: kind === 'unknown' });
    }
    const removeRe = /\b([A-Za-z_]\w*)\.remove\s*\(/g;
    while ((m = removeRe.exec(src))) {
      const kind = receiverKind(src, family, m[1]!);
      if (kind === 'hash') continue;
      ops.push({ pos: m.index, factor: 'linear', subject: m[1], ambiguous: kind === 'unknown' });
    }
  } else {
    add(
      /\.(?:indexOf|lastIndexOf|splice|shift|unshift|slice|substring|substr|join|reverse|concat|repeat|toCharArray|split|equals|clone|to_vec|to_string|chars|collect|ToList|ToArray|ToCharArray|Split|Substring|IndexOf|Contains|Reverse)\s*\(/g,
      'linear',
      receiverBefore,
    );
    add(/\b(?:System\.arraycopy|Arrays\.(?:copyOf|copyOfRange|fill|asList|stream|toString|equals)|String\.valueOf|JSON\.stringify|Array\.from|std::(?:find|count|accumulate|reverse|max_element|min_element)|(?<![.\w])(?:accumulate|max_element|min_element|reverse|strlen|strcpy|memset|copy)\s*\()/g, 'linear', argAfter);
    add(/\.\.\.\s*[A-Za-z_]/g, 'linear', (m) => rootIdentifier(m[0]));
    if (language === 'java' || language === 'kotlin') {
      add(/\.remove\s*\(\s*0\s*\)|\.add\s*\(\s*0\s*,/g, 'linear', receiverBefore);
    }
    if (language === 'javascript' || language === 'typescript') {
      add(/\.includes\s*\(/g, 'linear', receiverBefore);
    }

    const containsRe = /\b([A-Za-z_]\w*)\s*\.\s*(?:contains|remove)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = containsRe.exec(src))) {
      if (/remove\s*\(\s*0\s*\)/.test(src.slice(m.index, m.index + m[0].length + 4))) continue;
      const kind = receiverKind(src, family, m[1]!);
      if (kind === 'hash') continue;
      ops.push({ pos: m.index, factor: 'linear', subject: m[1], ambiguous: kind === 'unknown' });
    }
  }
  return ops;
}

/* ------------------------------------------------------------------ */
/* Complexity composition                                              */
/* ------------------------------------------------------------------ */

interface Cost {
  linear: number;
  log: number;
  /** Two linear factors over different collections: O(m·n). */
  distinct: boolean;
}

const ZERO: Cost = { linear: 0, log: 0, distinct: false };

function compareCost(a: Cost, b: Cost): number {
  if (a.linear !== b.linear) return a.linear - b.linear;
  return a.log - b.log;
}

function formatCost(c: Cost): string {
  const logPart = c.log === 0 ? '' : c.log === 1 ? 'log n' : `log^${c.log} n`;
  if (c.linear === 0) return c.log === 0 ? 'O(1)' : `O(${logPart})`;
  const sup: Record<number, string> = { 1: '', 2: '²', 3: '³' };
  const lin =
    c.linear === 2 && c.distinct
      ? 'm·n'
      : `n${sup[c.linear] ?? `^${c.linear}`}`;
  return `O(${lin}${logPart ? ` ${logPart}` : ''})`;
}

interface Analyzer {
  src: string;
  family: Family;
  loops: Loop[];
  aliases: Map<string, string>;
}

function contains(outer: Range, pos: number): boolean {
  return outer.start <= pos && pos < outer.end;
}

/** Loops whose body encloses `pos`, outermost first. */
function enclosing(a: Analyzer, pos: number, self?: Loop): Loop[] {
  return a.loops
    .filter((l) => {
      if (l === self || !contains(l.body, pos)) return false;
      if (self && l.body.start === self.body.start && l.body.end === self.body.end) {
        return l.idx < self.idx;
      }
      return true;
    })
    .sort(
      (x, y) =>
        y.body.end - y.body.start - (x.body.end - x.body.start) || x.idx - y.idx,
    );
}

/** Dimension key: collection root, with `#inner` for `grid[0]`-style bounds. */
function dimension(a: Analyzer, expr: string | undefined): string | undefined {
  const root = rootIdentifier(expr);
  if (!root) return undefined;
  const aliased = a.aliases.get(root);
  if (aliased) return aliased;
  const after = expr!.slice(expr!.indexOf(root) + root.length);
  return /^\s*\[/.test(after) ? `${root}#inner` : root;
}

function buildAliases(src: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const re =
    /(?<!,\s*)\b([A-Za-z_]\w*)\s*(?::[^=\n]*)?:?=\s*(?:len\s*\(\s*([^)]+)\)|([A-Za-z_][\w[\]]*)\s*\.\s*(?:length|size\(\)|count|len\(\)|Length|Count)\b)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const target = (m[2] ?? m[3] ?? '').trim();
    const root = rootIdentifier(target);
    if (!root || root === m[1]) continue;
    const inner = /\[/.test(target.slice(target.indexOf(root) + root.length));
    aliases.set(m[1]!, inner ? `${root}#inner` : root);
  }
  return aliases;
}

type Relation = 'same' | 'distinct' | 'unknown';

function relation(a: Analyzer, outer: Loop, inner: { bound?: string; start?: string; variable?: string }): Relation {
  const ov = outer.variable;
  const refersOuter = (expr: string | undefined) =>
    ov != null && expr != null && new RegExp(`\\b${ov}\\b`).test(expr);

  if (ov && inner.bound?.trim() === ov) return 'distinct'; // iterating an element (row of grid)
  if (refersOuter(inner.start) || refersOuter(inner.bound)) {
    const b = inner.bound ?? '';
    return new RegExp(`\\b${ov}\\s*\\]`).test(b) ? 'distinct' : 'same';
  }
  const od = dimension(a, outer.bound);
  const id = dimension(a, inner.bound);
  if (od && id) return od === id ? 'same' : 'distinct';
  return 'unknown';
}

interface ChainResult {
  cost: Cost;
  ambiguous: boolean;
}

/** Cost of executing something nested in `chain` (outermost first). */
function chainCost(a: Analyzer, chain: Loop[], extra?: CostOp): ChainResult {
  const active = chain.filter((l) => l.kind !== 'constant');
  let ambiguous = active.some((l) => l.kind === 'unknown');
  const linear = active.filter((l) => l.kind === 'linear');
  const cost: Cost = {
    linear: linear.length,
    log: active.filter((l) => l.kind === 'log').length,
    distinct: false,
  };

  if (linear.length >= 2 && linear.some((l) => l.isWhile)) ambiguous = true;
  for (let i = 1; i < linear.length; i++) {
    const rel = relation(a, linear[i - 1]!, linear[i]!);
    if (rel === 'unknown') ambiguous = true;
    if (rel === 'distinct') {
      if (linear.length === 2) cost.distinct = true;
      else ambiguous = true;
    }
  }

  if (extra) {
    if (extra.ambiguous && linear.length > 0) ambiguous = true;
    if (extra.factor === 'log') cost.log += 1;
    else {
      const innermost = linear[linear.length - 1];
      if (innermost) {
        const rel = relation(a, innermost, { bound: extra.subject });
        if (rel !== 'same') ambiguous = true;
        if (linear.some((l) => l.isWhile)) ambiguous = true;
      }
      cost.linear += 1;
      if (extra.factor === 'nlogn') cost.log += 1;
    }
  }
  return { cost, ambiguous };
}

/* ------------------------------------------------------------------ */
/* Space                                                               */
/* ------------------------------------------------------------------ */

type AllocSize = 'constant' | 'linear' | 'grid';

function collectAllocations(src: string, family: Family, language: string): AllocSize[] {
  const out: AllocSize[] = [];
  const scan = (re: RegExp, classify: (m: RegExpExecArray) => AllocSize) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out.push(classify(m));
  };
  const literalOnly = (text: string) =>
    /^[\s"\d.,:\-+()[\]{}]*$/.test(text.replace(/\b(?:True|False|None|true|false|null)\b/g, ''));
  const sized = (size: string | undefined): AllocSize =>
    smallLiteral(size != null ? splitTopLevel(size, ',')[0] : undefined, SMALL_ALLOCATION)
      ? 'constant'
      : 'linear';

  // Strings built with += are O(n).
  const strVars = /\b([A-Za-z_]\w*)\s*(?::[^=\n]*)?=\s*""/g;
  let sm: RegExpExecArray | null;
  while ((sm = strVars.exec(src))) {
    if (new RegExp(`\\b${sm[1]}\\s*\\+=`).test(src)) out.push('linear');
  }

  if (family === 'python') {
    scan(/\[\s*\[[^\]]*\]\s*\*\s*[^\]]+?\bfor\b|\[\s*\[[^\]]*\bfor\b[^\]]*\]\s*for\b/g, () => 'grid');
    scan(/(?<![\w\])])\[([^\][]*)\]\s*\*\s*\(?\s*([A-Za-z_\d][\w\s+\-*]*)/g, (m) => sized(m[2]!.trim()));
    scan(/\b(?:set|dict|list|deque|Counter|defaultdict|OrderedDict|frozenset|bytearray|sorted|tuple)\s*\(/g, () => 'linear');
    scan(/=\s*\[\s*\]|=\s*\{\s*\}/g, () => 'linear');
    scan(/=\s*(\[[^\]]+\]|\{[^}]+\})/g, (m) => (literalOnly(m[1]!) ? 'constant' : 'linear'));
    scan(/[[{][^\][{}()]*\bfor\b/g, () => 'linear');
    scan(/\.split\s*\(|\.join\s*\(|\.copy\s*\(|\[\s*::\s*-1\s*\]|\b[A-Za-z_]\w*\s*\[[^\][:]*:[^\]]*\]/g, () => 'linear');
    return out;
  }

  const js = language === 'javascript' || language === 'typescript';

  scan(/\bnew\s+[\w.]+(?:<[^>]*>)?\s*\[\s*([^\]]*)\](\s*\[)?(\s*\{)?/g, (m) =>
    m[2] ? 'grid' : m[3] && !m[1]!.trim() ? 'constant' : sized(m[1]),
  );
  scan(/\bvector\s*<\s*vector\b|\bmake\s*\(\s*\[\]\s*\[\]|new\s+Array\([^)]*\)\s*\.fill\([^)]*\)\s*\.map\(|Array\.from\([^)]*=>\s*(?:new\s+Array|Array\(|\[)/g, () => 'grid');
  scan(/\bnew\s+(?:ArrayList|LinkedList|HashMap|HashSet|TreeMap|TreeSet|LinkedHashMap|LinkedHashSet|ArrayDeque|Stack|PriorityQueue|StringBuilder|Map|Set|Queue|Deque|Dictionary|List|SortedSet|SortedDictionary|Vector)\b/g, () => 'linear');
  scan(/\b(?:Array|Int8Array|Uint8Array|Int16Array|Uint16Array|Int32Array|Uint32Array|Float64Array|IntArray|LongArray|BooleanArray|CharArray)\s*\(\s*([^)]*)\)/g, (m) => sized(m[1]));
  scan(/(?<![(,]\s*(?:const\s+)?)\b(?:vector|unordered_map|unordered_set|map|set|multiset|multimap|stack|queue|deque|priority_queue|list)\s*<[^;()]*>\s+[A-Za-z_]\w*\s*(?:\(\s*([^)]*)\)\s*;|[;={])/g, (m) =>
    m[1] != null ? sized(m[1]) : 'linear',
  );
  scan(/\b(?:int|long|char|bool|double|float|short)\s+[A-Za-z_]\w*\s*\[\s*([^\]]*)\]/g, (m) => sized(m[1]));
  if (language === 'cpp') scan(/\bstring\s+[A-Za-z_]\w*\s*=\s*(?!"")/g, () => 'linear');
  scan(/\bmake\s*\(\s*(?:\[\]|map\[)[^,)]*(?:,\s*([^,)]+))?/g, (m) => sized(m[1]));
  scan(/=\s*\[\s*\]|=\s*\{\s*\}|\[\]\w+\{|\bappend\s*\(|\bmalloc\s*\(|\bcalloc\s*\(/g, () => 'linear');
  scan(/Array\.from\s*\(|\bVec::(?:new|with_capacity)|\bvec!\s*\[|\b(?:HashMap|HashSet|BTreeMap|BTreeSet|VecDeque|String)::new|\bmutable(?:List|Map|Set)Of\s*\(|\b(?:hashMapOf|hashSetOf|arrayListOf)\s*\(/g, () => 'linear');
  scan(/\.(?:split|toCharArray|substring|substr|clone|to_vec|to_string|collect|ToList|ToArray|ToCharArray|Split|Substring)\s*\(|\[\s*\.\.\./g, () => 'linear');
  if (js) scan(/\.(?:map|filter|slice|concat)\s*\(/g, () => 'linear');
  return out;
}

/* ------------------------------------------------------------------ */
/* Patterns                                                            */
/* ------------------------------------------------------------------ */

function detectPatterns(src: string, loops: Loop[], recursive: boolean, memoized: boolean, funcs: Func[]): string[] {
  const has = (re: RegExp) => re.test(src);
  const tags: string[] = [];

  const binarySearch =
    has(/\bmid\w*\s*:?=\s*[^;\n]*(?:\/\s*2|\/\/\s*2|>>>?\s*1)/) ||
    has(/\b(?:bisect_left|bisect_right|bisect|binarySearch|BinarySearch|lower_bound|upper_bound)\s*\(/);
  if (binarySearch) tags.push('Binary search');

  if (recursive && (has(/\bbacktrack\w*\s*\(/i) || has(/\.(?:pop|pop_back|removeLast|RemoveAt)\s*\(/))) {
    tags.push('Backtracking');
  }
  if (memoized) tags.push('Memoization');
  else if (has(/\bdp\w*\s*(?:\[|=)/i)) tags.push('Dynamic programming');

  if (has(/\b(?:deque|Queue|ArrayDeque|queue)\b/) && has(/\.(?:popleft|poll|shift|front|pop_front|Dequeue|removeFirst)\s*\(/)) {
    tags.push('BFS');
  }
  if (recursive && (has(/\bdfs\s*\(/i) || has(/\.(?:left|right)\b/) || has(/\bvisited\b|\bseen\b/))) {
    tags.push('DFS');
  }
  if (has(/\bheapq\b|\bheappush\b|\bPriorityQueue\b|\bpriority_queue\b|\bBinaryHeap\b|\bMinPriorityQueue\b|\bMaxPriorityQueue\b|container\/heap/)) {
    tags.push('Heap');
  }

  const whileLoops = loops.filter((l) => l.isWhile);
  const pointerCond = /\b(left|l|lo|low|i|start|begin)\s*<=?\s*(right|r|hi|high|j|end)\b/;
  const window =
    has(/\bwindow\w*\b/i) ||
    (loops.some((o) => !o.isWhile && o.kind === 'linear' && whileLoops.some((w) => w !== o && contains(o.body, w.pos))) &&
      has(/\b(?:left|l|start)\s*(?:\+\+|\+=\s*1)|\+\+\s*(?:left|l|start)\b/));
  if (window) tags.push('Sliding window');
  else if (!binarySearch && whileLoops.some((w) => pointerCond.test(w.header))) tags.push('Two pointers');

  const stackName = /\b(?:stack|stk|st|mono\w*)\b/i;
  if (has(stackName) && whileLoops.some((w) => stackName.test(w.header) && /\[-1\]|\.top\(\)|\.peek\(\)|\.last\(\)|\.back\(\)|at\(-1\)|\.length\s*-\s*1\]/.test(w.header))) {
    tags.push('Monotonic stack');
  } else if (has(/\bStack\b|\bstack\b|\bstk\b/)) {
    tags.push('Stack');
  }
  if (has(/\bprefix\w*|\bpre_?sum\w*|\bpresum\w*|\bcumsum\b|\baccumulate\s*\(/i)) tags.push('Prefix sum');
  if (has(/\b(?:dict|defaultdict|Counter|HashMap|unordered_map|Dictionary|LinkedHashMap|hashMapOf|mutableMapOf)\b|new\s+Map\b|\bmake\s*\(\s*map|\bHashMap::new|=\s*\{\s*\}/)) {
    tags.push('Hash map');
  } else if (has(/\bset\s*\(|\bHashSet\b|\bunordered_set\b|new\s+Set\b|\bSet</)) {
    tags.push('Hash set');
  }
  if (has(/\bsorted\s*\(|\.sort\w*\s*\(|\b(?:Arrays|Collections|Array)\.[sS]ort\s*\(|(?<![.\w])(?:std::)?sort\s*\(/)) tags.push('Sorting');
  const bitOps = /\^|&\s*1\b|<<\s*\d|<<=|>>=|>>>|>>\s*[2-9]|&\s*\(\s*\w+\s*-\s*1\s*\)|\bbin\s*\(|bitCount|popcount|bit_count|count_ones|countOneBits/g;
  if ((src.match(bitOps) ?? []).length >= 2) {
    tags.push('Bit manipulation');
  }
  if (loops.some((l) => l.reverse && l.kind === 'linear')) tags.push('Reverse traversal');

  if (recursive && !tags.some((t) => ['Backtracking', 'DFS', 'Memoization'].includes(t))) tags.push('Recursion');

  const nested = loops.some(
    (o) => o.kind === 'linear' && !o.isWhile && loops.some((i) => i !== o && i.kind === 'linear' && !i.isWhile && contains(o.body, i.pos)),
  );
  if (tags.length === 0 && nested && funcs.length <= 3) tags.push('Nested loops');
  return tags;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Analyze a solution. Returns only what could be inferred with reasonable
 * confidence; unknown fields are left undefined.
 */
export function analyzeSolution(code: string, language: string): SolutionAnalysis {
  const result: SolutionAnalysis = { version: ANALYSIS_VERSION };
  const family = languageFamily(language);
  if (!family || !code.trim() || code.length > MAX_CODE_LENGTH) return result;

  const lang = language.toLowerCase();
  const src = stripCommentsAndStrings(stripSyncHeader(code), family);
  const { loops, funcs } = family === 'python' ? parsePython(src) : parseBrace(src, lang);
  const a: Analyzer = { src, family, loops, aliases: buildAliases(src) };

  // Classify while-loops: halving / digit loops and binary search are log n.
  const directText = (l: Loop): string => {
    let text = src.slice(l.body.start, l.body.end);
    for (const child of loops) {
      if (child !== l && contains(l.body, child.pos) && child.body.start >= l.body.start) {
        const s = Math.max(child.body.start, l.body.start) - l.body.start;
        const e = Math.min(child.body.end, l.body.end) - l.body.start;
        if (s >= 0 && e > s) text = text.slice(0, s) + ' '.repeat(e - s) + text.slice(e);
      }
    }
    return `${l.header}\n${text}`;
  };
  for (const l of loops) {
    if (!l.isWhile || l.kind === 'unknown') continue;
    const text = directText(l);
    const halving =
      /\bmid\w*\s*:?=/.test(text) ||
      /\b([A-Za-z_]\w*)\s*(?:\/\/=|\/=|>>=|>>>=)\s*(?:2|10|1)\b/.test(text) ||
      /\b([A-Za-z_]\w*)\s*=\s*(?:Math\.floor\s*\(|int\s*\(|Math\.trunc\s*\()?\s*\1\s*(?:\/\/|\/|>>>?)\s*(?:2|10)\b/.test(text) ||
      /\b([A-Za-z_]\w*)\s*(?:\*=\s*2|<<=\s*1)\b/.test(text) ||
      /\b([A-Za-z_]\w*)\s*&=\s*\1\s*-\s*1\b|\b([A-Za-z_]\w*)\s*=\s*\2\s*&\s*\(\s*\2\s*-\s*1\s*\)/.test(text);
    if (halving) l.kind = 'log';
  }

  // Functions: recursion, memoization, helpers-with-loops called inside loops.
  let recursive = false;
  let helperInLoop = false;
  for (const f of funcs) {
    if (!f.name) continue;
    const call = new RegExp(`\\b${f.name}\\s*\\(`, 'g');
    let m: RegExpExecArray | null;
    const bodyText = src.slice(f.body.start, f.body.end);
    if (new RegExp(`\\b${f.name}\\s*\\(`).test(bodyText)) recursive = true;
    const hasLoops = loops.some((l) => contains(f.body, l.pos) && l.kind !== 'constant');
    if (!hasLoops) continue;
    while ((m = call.exec(src))) {
      if (m.index === f.namePos || contains(f.body, m.index)) continue;
      if (enclosing(a, m.index).some((l) => l.kind !== 'constant')) helperInLoop = true;
    }
  }
  const memoized =
    recursive &&
    (funcs.some((f) => /@(?:functools\.)?(?:cache|lru_cache)\b/.test(f.decorators)) ||
      /\bmemo\w*\b|\bcache\b|\bdp\s*\[/i.test(src));

  // Time complexity.
  let time: Cost = ZERO;
  let timeAmbiguous = recursive || helperInLoop;
  const consider = (r: ChainResult) => {
    if (r.ambiguous) timeAmbiguous = true;
    const cmp = compareCost(r.cost, time);
    if (cmp > 0) time = r.cost;
    else if (cmp === 0 && r.cost.distinct) time = { ...time, distinct: true };
  };
  for (const l of loops) consider(chainCost(a, [...enclosing(a, l.pos, l), l]));
  for (const op of collectCostOps(src, family, lang)) {
    consider(chainCost(a, enclosing(a, op.pos), op));
  }

  const orderedStructure = /\bTreeMap\b|\bTreeSet\b|\bSortedList\b|\bSortedDict\b|\bSortedSet\b|\bSortedDictionary\b|\bBTreeMap\b|\bBTreeSet\b|\binsort\w*\s*\(|(?<!unordered_)\b(?:multi)?(?:map|set)\s*</.test(src);
  const heap = /\bPriorityQueue\b|\bpriority_queue\b|\bBinaryHeap\b|\bMinPriorityQueue\b|\bMaxPriorityQueue\b|container\/heap|\bheapq\b|\bheappush\b|\bnlargest\b|\bnsmallest\b/.test(src);
  if (orderedStructure || heap) timeAmbiguous = true;

  if (!timeAmbiguous) result.timeComplexity = formatCost(time);

  // Space complexity.
  if (!recursive) {
    const allocs = collectAllocations(src, family, lang);
    if (allocs.includes('grid')) {
      // 2-D tables: dimensions are rarely clear from the code alone.
    } else if (allocs.includes('linear')) {
      result.spaceComplexity = 'O(n)';
    } else if (SPACE_O1_LANGS.has(lang)) {
      result.spaceComplexity = 'O(1)';
    }
  }

  const patterns = detectPatterns(src, loops, recursive, memoized, funcs);
  if (patterns.length > 0) result.pattern = patterns.slice(0, 2).join(' + ');
  if (recursive) result.style = 'recursive';
  else if (loops.length > 0) result.style = 'iterative';

  return result;
}
