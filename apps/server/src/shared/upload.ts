const KB = 1024;
const MB = KB * KB;

// Example prefixes — replace with whatever upload categories your app needs.
// `prefix` in getUploadUrl (functions/file-upload.ts) must be one of these keys.
export const prefixSizeMap = {
  avatars: 5 * MB,
  attachments: 20 * MB,
} as const;
export type PrefixFile = keyof typeof prefixSizeMap;
