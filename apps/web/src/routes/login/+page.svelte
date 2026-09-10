<script lang="ts">
  import { errorMessage, toast } from "$lib";
  import { token, refresh } from "$lib/stores/token.svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Icon from "@iconify/svelte";
  import { trpc_ } from "$lib/client.svelte";

  let username = $state("");
  let password = $state("");
  let isLoading = $state(false);
  let isOIDCLoading = $state(false);
  const redirectTo = page.url.searchParams.get("redirect") || "/";

  const handlePasswordLogin = async () => {
    if (!username.trim() || !password.trim()) {
      toast.error("Please enter both username and password");
      return;
    }

    isLoading = true;
    try {
      const res = await trpc_.login.mutate({
        username: username.trim(),
        password,
      });
      token.value = res.accessToken;
      refresh.value = res.refreshToken;
      toast.success("Login successful!");
      goto(redirectTo);
    } catch (error) {
      toast.error(errorMessage(error, "Login failed"));
    } finally {
      isLoading = false;
    }
  };

  const handleOIDCLogin = async () => {
    isOIDCLoading = true;
    try {
      const res = await trpc_.oidcInitiateLogin.query({ redirectUrl: redirectTo });
      // Redirect to OIDC provider's login page
      window.location.href = res.authUrl;
    } catch (error) {
      toast.error(errorMessage(error, "OIDC login failed"));
      isOIDCLoading = false;
    }
  };

  const handleKeyPress = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      handlePasswordLogin();
    }
  };
</script>

<div class="min-h-screen flex items-center justify-center bg-base-200">
  <div class="card w-full max-w-md bg-base-100 shadow-2xl">
    <div class="card-body">
      <h1 class="text-3xl font-bold text-center mb-2">Welcome Back</h1>
      <p class="text-center text-base-content/60 mb-6">Sign in to continue</p>

      <!-- OIDC Login Option -->
      <div class="space-y-3 mb-6">
        <h2 class="text-sm font-semibold text-base-content/70 uppercase">Quick Sign In</h2>

        <button
          class="btn btn-outline w-full justify-start gap-3"
          onclick={handleOIDCLogin}
          disabled={isOIDCLoading || isLoading}
        >
          <Icon icon="mdi:shield-account" width="20" height="20" />
          <span>
            {#if isOIDCLoading}
              Redirecting...
            {:else}
              Continue with SSO
            {/if}
          </span>
        </button>
      </div>

      <div class="divider">OR</div>

      <!-- Username/Password Login -->
      <div class="form-control">
        <label class="label" for="username">
          <span class="label-text">Username</span>
        </label>
        <input
          id="username"
          type="text"
          placeholder="Enter your username"
          class="input input-bordered"
          bind:value={username}
          onkeypress={handleKeyPress}
          disabled={isLoading || isOIDCLoading}
        />
      </div>

      <div class="form-control mt-4">
        <label class="label" for="password">
          <span class="label-text">Password</span>
        </label>
        <input
          id="password"
          type="password"
          placeholder="Enter your password"
          class="input input-bordered"
          bind:value={password}
          onkeypress={handleKeyPress}
          disabled={isLoading || isOIDCLoading}
        />
      </div>

      <div class="form-control mt-6">
        <button
          class="btn btn-primary"
          onclick={handlePasswordLogin}
          disabled={isLoading || isOIDCLoading || !username.trim() || !password.trim()}
        >
          {#if isLoading}
            <span class="loading loading-spinner"></span>
            Signing in...
          {:else}
            Sign In
          {/if}
        </button>
      </div>

      <!-- <div class="text-center mt-4">
        <p class="text-sm text-base-content/60">
          Don't have an account?
          <a href="/register" class="link link-primary">Sign up</a>
        </p>
      </div> -->
    </div>
  </div>
</div>
