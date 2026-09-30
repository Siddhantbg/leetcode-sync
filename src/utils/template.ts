import type { Submission } from '@/types';
import { localDateKey } from './format';

/**
 * Render a commit-message template, substituting the supported variables:
 *   {number} {title} {difficulty} {language} {date}
 * Unknown placeholders are left untouched so typos are visible to the user.
 */
export function renderCommitMessage(template: string, s: Submission): string {
  const vars: Record<string, string> = {
    number: String(s.number),
    title: s.title,
    difficulty: s.difficulty,
    language: s.language,
    date: localDateKey(new Date(s.submittedAt || Date.now())),
  };

  return template.replace(
    /\{(number|title|difficulty|language|date)\}/g,
    (_match, key: string) => vars[key] ?? _match,
  );
}
