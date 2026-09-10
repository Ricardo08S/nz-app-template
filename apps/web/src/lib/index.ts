import { config as env } from "$lib/config";
import type { CreateQueryResult } from "@tanstack/svelte-query";
import { TRPCClientError } from "@trpc/client";
import { customAlphabet } from "nanoid";
import type { AppRouter } from "../../../server/src/router";
import toast from "svelte-french-toast";
export { toast };
import * as z from "zod";
export { z };

function genCharArray(st: string, ed: string): string[] {
  const res = [];
  const endChar = ed.charCodeAt(0);
  for (let i = st.charCodeAt(0); i <= endChar; ++i) {
    res.push(String.fromCharCode(i));
  }
  return res;
}

export const nanoid = customAlphabet(
  [...genCharArray("a", "z"), ...genCharArray("A", "Z"), ...genCharArray("0", "9")].join(""),
);

export function isTRPCClientError(cause: unknown): cause is TRPCClientError<AppRouter> {
  return cause instanceof TRPCClientError;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const serverErrorV = z.object({
  status: z.number(),
  info: z.object({
    message: z.string(),
    stack: z.string().optional(),
    details: z.unknown().optional(),
  }),
});
export type ServerError = z.infer<typeof serverErrorV>;
export function isServerError(cause: unknown): cause is ServerError {
  const safe = serverErrorV.safeParse(cause);
  return safe.success;
}
export const getFileUrl = (key: string): string => {
  return `${env.PUBLIC_S3_ENDPOINT}/${key}`;
};

export { uploadFile, uploadFiles } from "./upload";

export type ResultType<T> = T extends CreateQueryResult<infer D> ? D : unknown;
