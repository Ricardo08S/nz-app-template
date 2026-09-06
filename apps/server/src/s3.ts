import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TRPCError } from "@trpc/server";
import { env } from "./env.js";
import { nanoid } from "./lib.js";

// Initialize S3 Client
export const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
  // The SDK adds a CRC32 checksum by default, but a presigned URL is signed
  // before the body exists, so it ships a zero checksum that S3-compatible
  // servers reject with InvalidDigest.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  ...(env.AWS_S3_ENDPOINT && {
    endpoint: env.AWS_S3_ENDPOINT,
    forcePathStyle: true, // Required for Garage, MinIO and LocalStack
  }),
});

export interface GeneratePresignedUrlParams {
  key: string;
  contentLength?: number;
  contentType?: string;
  expiresIn?: number; // in seconds, default 3600 (1 hour)
  metadata?: Record<string, string>;
}

/**
 * Generate a presigned URL for uploading a file to S3
 */
export const generatePresignedUploadUrl = async ({
  key,
  contentLength,
  contentType,
  expiresIn = 3600,
  metadata,
}: GeneratePresignedUrlParams) => {
  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
    Metadata: metadata,
  });

  const url = await getSignedUrl(s3, command, { expiresIn });
  return url;
};

/**
 * Generate a unique file key with optional prefix
 */
export const generateFileKey = (
  userId: string,
  originalFilename: string,
  prefix?: string,
): { filename: string; key: string } => {
  const timestamp = Date.now();
  const sanitizedFilename = originalFilename.replace(/[^a-zA-Z0-9.-]/g, "_");
  const filename = `${timestamp}-${nanoid(5)}-${sanitizedFilename}`;
  const basePath = prefix ? `${prefix}/` : "";
  const key = `${basePath}${userId}/${filename}`;
  return { key, filename };
};

/**
 * Get the public URL for a file
 */
export const getFileUrl = (key: string): string => {
  // Must not use AWS_S3_ENDPOINT: that one requires a signature for GetObject.
  if (env.PUBLIC_S3_ENDPOINT) {
    return `${env.PUBLIC_S3_ENDPOINT}/${key}`;
  }
  // For AWS S3
  return `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
};

/**
 * Check if file exists in S3 and get its size and content type
 */
export const getFileSize = async (
  key: string,
): Promise<{ size: number; contentType: string }> => {
  // Only the S3 call itself falls back to a generic "does not exist" - the
  // two validation throws below must propagate with their own message, not
  // get swallowed by the same catch.
  let res: HeadObjectCommandOutput;
  try {
    res = await s3.send(new HeadObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key }));
  } catch (error) {
    console.error(`HeadObject failed for key ${key}:`, error);
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `File with key ${key} does not exist in S3`,
    });
  }

  if (res.ContentLength === undefined) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `File with key ${key} does not have Content-Length.`,
    });
  }
  if (!res.ContentType) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `File with key ${key} does not have Content-Type.`,
    });
  }
  return {
    size: res.ContentLength,
    contentType: res.ContentType,
  };
};
