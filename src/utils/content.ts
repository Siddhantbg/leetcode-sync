import type { Settings, Submission } from '@/types';
import { lineComment } from './comment';
import { localDateKey } from './format';

/**
 * Build the file content to commit. When `includeNotes` is enabled, prepend a
 * language-appropriate comment header with problem metadata (number, title,
 * difficulty, URL, runtime, memory, tags, notes). Otherwise commit the raw code.
 */
export function buildFileContent(settings: Settings, s: Submission): string {
  if (!settings.includeNotes) return s.code;

  const c = lineComment(s.languageExt);
  const header: string[] = [];

  header.push(`${c} ${s.number}. ${s.title} [${s.difficulty}]`);
  if (s.url) header.push(`${c} ${s.url}`);

  const meta = [`Language: ${s.language}`];
  if (s.runtime) meta.push(`Runtime: ${s.runtime}`);
  if (s.memory) meta.push(`Memory: ${s.memory}`);
  header.push(`${c} ${meta.join(' | ')}`);

  const auto = ' (auto-detected)';
  const time = s.timeComplexity ?? s.analysis?.timeComplexity;
  const space = s.spaceComplexity ?? s.analysis?.spaceComplexity;
  if (time) header.push(`${c} Time:  ${time}${s.timeComplexity ? '' : auto}`);
  if (space) header.push(`${c} Space: ${space}${s.spaceComplexity ? '' : auto}`);
  if (s.analysis?.pattern) header.push(`${c} Pattern: ${s.analysis.pattern}`);

  if (s.tags && s.tags.length > 0) {
    header.push(`${c} Tags: ${s.tags.join(', ')}`);
  }
  header.push(
    `${c} Synced: ${localDateKey(new Date(s.submittedAt || Date.now()))}`,
  );

  if (s.notes && s.notes.trim()) {
    header.push(c);
    for (const line of s.notes.split('\n')) header.push(`${c} ${line}`);
  }

  return `${header.join('\n')}\n\n${s.code}`;
}
