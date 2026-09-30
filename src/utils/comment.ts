/**
 * Line-comment prefix per file extension, used to build the metadata header.
 * Languages not listed fall back to "//".
 */
const LINE_COMMENT: Record<string, string> = {
  py: '#',
  rb: '#',
  sh: '#',
  ex: '#',
  sql: '--',
  rkt: ';',
  erl: '%',
};

export function lineComment(ext: string): string {
  return LINE_COMMENT[ext] ?? '//';
}
