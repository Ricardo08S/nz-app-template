const KB = 1024;
const MB = KB * KB;
export const prefixSizeMap = {
  posts: 5 * MB,
  "assignment-submissions": 50 * MB,
  reports: 10 * MB,
  "class-assets": 100 * MB,
} as const;
export type PrefixFile = keyof typeof prefixSizeMap;
