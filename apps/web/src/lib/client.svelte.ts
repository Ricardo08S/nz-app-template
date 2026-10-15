//? tRPC
import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  loggerLink,
  splitLink,
  type HTTPHeaders,
} from "@trpc/client";
import SuperJSON from "superjson";
import type { AppRouter } from "../../../server/src/router";
import type { SchemaType } from "../../../server/src/zenstack/schema";
import { env } from "$env/dynamic/public";
import { token } from "./stores/token.svelte";
import { myFetch, myFetchNoRefresh } from "./my-fetch.svelte";
import { typedClient, type WithZenStack, type WithClient } from "zenstack-trpc";

const createTRPC = (fetch?: Parameters<typeof httpBatchLink>[0]["fetch"]) =>
  createTRPCClient<AppRouter>({
    links: [
      loggerLink({}),
      splitLink({
        // uses the httpSubscriptionLink for subscriptions
        condition: (op) => op.type === "subscription",
        true: httpSubscriptionLink({
          transformer: SuperJSON,
          url: `${env.PUBLIC_BACKEND_URL}/trpc`,
        }),
        false: httpBatchLink({
          transformer: SuperJSON,
          url: `${env.PUBLIC_BACKEND_URL}/trpc`,
          headers: () => {
            const res: HTTPHeaders = {};
            if (token.value) {
              res.Authorization = token.value;
            }
            return res;
          },
          fetch,
        }),
      }),
    ],
  });

type Typed = WithClient<WithZenStack<SchemaType, "crud">>;
export const trpc = typedClient<Typed>()(createTRPC(myFetch));
export const trpc_ = typedClient<Typed>()(createTRPC(myFetchNoRefresh));

//? Zenstack V3 RPC
import { useClientQueries } from "@zenstackhq/tanstack-query/svelte";
import { schema } from "$lib/zenstack/schema";

export const client = useClientQueries(schema, () => ({
  endpoint: `${env.PUBLIC_BACKEND_URL}/api/model`,
  fetch: myFetch,
}));
