import { isServerError, isTRPCClientError } from "$lib";

export function createErrorMessage<E extends Error>(
  error: NonNullable<E>,
  options?: { errorFn?: (err: E) => string; notFound?: string },
) {
  const { errorFn, notFound } = options ?? {};

  if (errorFn) {
    return errorFn(error);
  }

  if (isTRPCClientError(error)) {
    const { data } = error;
    if (data) {
      if (data.httpStatus === 404 && notFound) {
        return notFound;
      }
      // return `[${data.httpStatus}] ${data.code}: ${error.message}`;
      return `[${data.httpStatus}] ${error.message}`;
    }
    return error;
  }

  if (isServerError(error)) {
    return `[${error.status}] ${error.info.message}`;
  }

  return error;
}
