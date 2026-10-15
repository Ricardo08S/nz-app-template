<script lang="ts" generics="T,E extends Error">
  import type { CreateQueryResult } from "@tanstack/svelte-query";
  import ContentNotFound from "./ContentNotFound.svelte";
  import ErrorMessage from "./ErrorMessage.svelte";
  import Loading from "./Loading.svelte";
  import { isServerError, isTRPCClientError } from "$lib";
  // import type {useModelQuery} from "@zenstackhq/tanstack-query/runtime-v5/svelte";

  let {
    q,
    errorFn,
    notFound,
    children,
    data = $bindable(),
  }: {
    q: CreateQueryResult<T, E>; // | ReturnType<typeof useModelQuery<T, T, E>>;
    errorFn?: (err: E) => string;
    notFound?: string;
    children: (data: NonNullable<T>) => any;
    data?: T;
  } = $props();

  $effect(() => {
    data = q.data;
  });

  function createErrorMessage(error: NonNullable<E>) {
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
</script>

{#if q.isLoading}
  <Loading />
{:else if q.error}
  <ErrorMessage message={createErrorMessage(q.error)} />
{:else if !q.data}
  <ContentNotFound message={notFound ?? `Not found.`} />
{:else}
  {@render children(q.data)}
{/if}
