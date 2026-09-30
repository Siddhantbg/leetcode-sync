/**
 * Maps a LeetCode language identifier to a source-file extension.
 * LeetCode's `lang` values are things like "python3", "cpp", "golang".
 */
const LANGUAGE_EXT: Record<string, string> = {
  python: 'py',
  python3: 'py',
  pythondata: 'py',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  java: 'java',
  javascript: 'js',
  typescript: 'ts',
  php: 'php',
  swift: 'swift',
  kotlin: 'kt',
  dart: 'dart',
  golang: 'go',
  go: 'go',
  ruby: 'rb',
  scala: 'scala',
  rust: 'rs',
  racket: 'rkt',
  erlang: 'erl',
  elixir: 'ex',
  mysql: 'sql',
  mssql: 'sql',
  oraclesql: 'sql',
  postgresql: 'sql',
  pythonml: 'py',
  bash: 'sh',
};

/** Returns the file extension (without dot) for a language id, defaulting to "txt". */
export function languageToExt(lang: string): string {
  return LANGUAGE_EXT[lang.toLowerCase()] ?? 'txt';
}
