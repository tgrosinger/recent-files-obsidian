// This module handles data storage and retrieval.

interface FilePath {
  path: string;
  basename: string;
}

interface RecentFilesData {
  recentFiles: FilePath[];
  omittedPaths: string[];
  omittedTags: string[];
  maxLength: number | null;
}

const defaultMaxLength = 50;

const DEFAULT_DATA: RecentFilesData = {
  recentFiles: [],
  omittedPaths: [],
  omittedTags: [],
  maxLength: null,
};

export { defaultMaxLength, DEFAULT_DATA };
export type { FilePath, RecentFilesData };
