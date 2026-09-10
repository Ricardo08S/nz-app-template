import { TRPCError } from "@trpc/server";
import { z } from "../lib.ts";
import {
  generateFileKey,
  generatePresignedUploadUrl,
  getFileSize,
  getFileUrl,
} from "../s3.ts";
import { prefixSizeMap, type PrefixFile } from "../shared/upload.ts";
import { tuser } from "../trpc.ts";

/**
 * Get a presigned URL for uploading a file to S3
 * Creates a File record with PENDING status first, then returns the presigned URL
 * Requires authentication
 */
export const getUploadUrl = tuser
  .input(
    z.object({
      filename: z.string().min(1).max(255),
      contentType: z.string().min(1).max(255),
      prefix: z.enum(Object.keys(prefixSizeMap) as PrefixFile[]),
      path: z.string().min(1).max(512).optional(),
      expiresIn: z.number().int().positive().max(3600).default(3600),
      contentLength: z.number().int().positive(),
      metadata: z.record(z.string(), z.string()).optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const {
      filename: originalFilename,
      contentType,
      prefix,
      path,
      expiresIn,
      contentLength,
      metadata,
    } = input;

    // Validate file size against prefix-specific limit
    const maxSize = prefixSizeMap[prefix];
    if (maxSize == null || Number.isNaN(maxSize)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Invalid prefix: ${prefix}`,
      });
    }
    if (contentLength > maxSize) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB for ${prefix}`,
      });
    }

    // Generate a unique key for the file
    const { key, filename } = generateFileKey(
      ctx.user.id,
      originalFilename,
      path ?? prefix,
    );

    // Generate presigned URL
    const uploadUrl = await generatePresignedUploadUrl({
      key,
      contentType,
      expiresIn,
      metadata,
      contentLength,
    });

    // Create File record with PENDING status
    await ctx.userDb.file.create({
      data: {
        userId: ctx.user.id,
        key,
        originalFilename,
        filename,
        contentType,
        status: "PENDING",
      },
    });

    // Log the upload request
    ctx.log.info("file-upload:get-presigned-url", {
      key,
      filename,
      contentType,
    });

    return {
      uploadUrl,
      key,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  });

/**
 * Confirm that a file upload was completed successfully
 * Updates the File record status from PENDING to UPLOADED
 */
export const confirmUpload = tuser
  .input(
    z.object({
      key: z.string().min(1),
    }),
  )
  .mutation(async ({ input, ctx: { userDb, log } }) => {
    const { key } = input;

    // Check if file exists in S3 and get its size
    const { size, contentType } = await getFileSize(key);

    // Update File record status to UPLOADED
    const file = await userDb.file.update({
      where: {
        key,
      },
      data: {
        status: "UPLOADED",
        size,
        contentType,
      },
    });

    // Log the successful upload
    log.info("file-upload:confirmed", {
      key: file.key,
      filename: file.filename,
      size,
      contentType,
    });

    return {
      success: true,
      file: {
        key: file.key,
        filename: file.filename,
        originalFilename: file.originalFilename,
        contentType: file.contentType,
        size: file.size,
        url: getFileUrl(file.key),
        status: file.status,
      },
    };
  });
