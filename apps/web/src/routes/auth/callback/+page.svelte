<script lang="ts">
  import { errorMessage, toast } from "$lib";
  import { token, refresh } from "$lib/stores/token.svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { trpc_ } from "$lib/client.svelte";
  import { onMount } from "svelte";

  let isLoading = $state(true);
  let error = $state("");

  onMount(async () => {
    try {
      const code = page.url.searchParams.get("code");
      const state = JSON.parse(page.url.searchParams.get("state") ?? "{}");

      // if (state.direct) {
      //   const sep = (state.direct as string).includes("?") ? "&" : "?";
      //   location.href = `${state.direct}${sep}${page.url.searchParams.toString()}`;
      //   return;
      // }
      // Get the authorization code from URL parameters

      if (!code) {
        throw new Error("No authorization code received");
      }

      // Exchange the code for tokens
      const res = await trpc_.oidcHandleCallback.mutate({ code });

      // Store tokens
      token.value = res.accessToken;
      refresh.value = res.refreshToken;

      toast.success("Successfully logged in with SSO!");

      // Redirect to home or previous page
      goto(state.redirectUrl ?? "/");
    } catch (err) {
      console.error("OIDC callback error:", err);
      error = errorMessage(err, "Failed to complete SSO login");
      toast.error(error);
      isLoading = false;
    }
  });
</script>

<div class="min-h-screen flex items-center justify-center bg-base-200">
  <div class="card w-full max-w-md bg-base-100 shadow-2xl">
    <div class="card-body text-center">
      {#if isLoading}
        <div class="flex flex-col items-center gap-4">
          <span class="loading loading-spinner loading-lg"></span>
          <h2 class="text-2xl font-bold">Completing sign in...</h2>
          <p class="text-base-content/60">Please wait while we verify your credentials</p>
        </div>
      {:else if error}
        <div class="flex flex-col items-center gap-4">
          <div class="text-error text-5xl">✕</div>
          <h2 class="text-2xl font-bold">Sign in failed</h2>
          <p class="text-base-content/60">{error}</p>
          <a href="/login" class="btn btn-primary mt-4">Back to Login</a>
        </div>
      {/if}
    </div>
  </div>
</div>
