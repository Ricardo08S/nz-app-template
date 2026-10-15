<script lang="ts">
  import { browser } from "$app/environment";
  import { env } from "$env/dynamic/public";
  import { toast } from "$lib";
  import favicon from "$lib/assets/favicon.svg";
  import { trpc } from "$lib/client.svelte";
  import { AuthError, myFetch } from "$lib/my-fetch.svelte";
  import { token, userState } from "$lib/stores/token.svelte";
  import {
    MutationCache,
    QueryCache,
    QueryClient,
    QueryClientProvider,
  } from "@tanstack/svelte-query";
  import { SvelteQueryDevtools } from "@tanstack/svelte-query-devtools";
  import { setQuerySettingsContext } from "@zenstackhq/tanstack-query/svelte";
  import { Toaster } from "svelte-french-toast";
  import "./layout.css";
  import { constants } from "./_/constants";

  let { children } = $props();

  $effect(() => {
    const jwtToken = token.value;
    // console.log(`jwtToken`, jwtToken)
    if (!jwtToken) {
      userState.data = null;
      userState.tokenInvalid = true;
      // console.log("Canceled.");
      return;
    }
    // reset tokenInvalid
    userState.tokenInvalid = false;
    (async () => {
      const me = await trpc.me.query();
      userState.data = me;
    })();
  });

  setQuerySettingsContext({
    endpoint: `${env.PUBLIC_BACKEND_URL}/api/model`,
    fetch: myFetch,
    logging: env.PUBLIC_ENABLE_LOGGING?.toLowerCase() === "true",
  });

  const queryClient = new QueryClient({
    queryCache: new QueryCache({}),
    mutationCache: new MutationCache({}),
    defaultOptions: {
      queries: {
        enabled: browser,
        throwOnError: (error) => !(error instanceof AuthError),
        retry: (failureCount, error) => failureCount < 3 && !(error instanceof AuthError),
        refetchOnMount: "always",
        refetchOnReconnect: true,
      },
      mutations: {
        throwOnError: true,
        onError(error) {
          // Don't show toast for auth errors (handled by redirect to login)
          if (error instanceof AuthError) {
            return;
          }
          toast.error(`${error.message}`);
        },
        retry: false,
      },
    },
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <title>{constants.brandName}</title>
</svelte:head>

<QueryClientProvider client={queryClient}>
  {@render children()}
  <Toaster />
  <SvelteQueryDevtools />
</QueryClientProvider>
