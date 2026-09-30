import type {
  FileNaming,
  FolderNaming,
  Settings,
  Submission,
} from '@/types';

/** Typed getElementById that throws if the markup drifts. */
export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`[options] missing element #${id}`);
  return node as T;
}

const input = (id: string) => el<HTMLInputElement>(id);
const select = (id: string) => el<HTMLSelectElement>(id);

/** Populate the form fields from a Settings object. */
export function fillForm(settings: Settings): void {
  input('username').value = settings.github.username;
  input('repo').value = settings.github.repo;
  input('branch').value = settings.github.branch;
  input('rootFolder').value = settings.rootFolder;
  select('folderNaming').value = settings.folderNaming;
  select('fileNaming').value = settings.fileNaming;
  input('perProblemFolder').checked = settings.perProblemFolder;
  input('commitTemplate').value = settings.commitMessageTemplate;
  input('autoSync').checked = settings.autoSync;
  input('includeReadme').checked = settings.includeReadme;
  input('includeNotes').checked = settings.includeNotes;
}

/** Read the current form values back into a Settings object. */
export function readForm(): Settings {
  return {
    github: {
      username: input('username').value.trim(),
      repo: input('repo').value.trim(),
      branch: input('branch').value.trim() || 'main',
    },
    rootFolder: input('rootFolder').value.trim(),
    folderNaming: select('folderNaming').value as FolderNaming,
    fileNaming: select('fileNaming').value as FileNaming,
    perProblemFolder: input('perProblemFolder').checked,
    commitMessageTemplate:
      input('commitTemplate').value.trim() ||
      'LeetCode: Solve #{number} {title}',
    autoSync: input('autoSync').checked,
    includeReadme: input('includeReadme').checked,
    includeNotes: input('includeNotes').checked,
  };
}

/** A representative submission used for live path/commit previews. */
export const SAMPLE_SUBMISSION: Submission = {
  key: '1-python3',
  number: 1,
  title: 'Two Sum',
  titleSlug: 'two-sum',
  difficulty: 'Easy',
  language: 'python3',
  languageExt: 'py',
  code: '',
  submittedAt: Date.now(),
};
