/**
 * Reusable GitHub REST API wrapper. Import from `@/github`.
 */
export {
  authenticate,
  getRepo,
  getFileSHA,
  getFileContent,
  fileExists,
  createFile,
  updateFile,
  commitFile,
  deleteFile,
  type WriteFileParams,
} from './api';
export { GitHubApiError, friendlyMessage, type GitHubErrorKind } from './errors';
