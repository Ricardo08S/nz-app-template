const KB = 1024;
const MB = KB * KB;
export const prefixSizeMap = {
  posts: 5 * MB,
} as const;
export type PrefixFile = keyof typeof prefixSizeMap;
