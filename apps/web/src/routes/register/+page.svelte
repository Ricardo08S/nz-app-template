<script lang="ts">
  import { toast } from "$lib";
  import { trpc } from "$lib/client.svelte";
  import { token, refresh } from "$lib/stores/token.svelte";
  import { goto } from "$app/navigation";

  let name = $state("");
  let username = $state("");
  let password = $state("");
  let confirmPassword = $state("");
  let isLoading = $state(false);

  const handleRegister = async () => {
    if (!name.trim() || !username.trim() || !password.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (password.length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }

    isLoading = true;
    try {
      const res = await trpc.register.mutate({
        name: name.trim(),
        username: username.trim(),
        password,
      });
      token.value = res.accessToken;
      refresh.value = res.refreshToken;
      toast.success("Account created successfully!");
      goto("/");
    } catch (error: any) {
      toast.error(error.message || "Registration failed");
    } finally {
      isLoading = false;
    }
  };

  const handleKeyPress = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      handleRegister();
    }
  };
</script>

<div class="min-h-screen flex items-center justify-center bg-base-200">
  <div class="card w-full max-w-md bg-base-100 shadow-2xl">
    <div class="card-body">
      <h1 class="text-3xl font-bold text-center mb-2">Create Account</h1>
      <p class="text-center text-base-content/60 mb-6">Join us today</p>

      <div class="form-control">
        <label class="label">
          <span class="label-text">Full Name</span>
        </label>
        <input
          type="text"
          placeholder="Enter your full name"
          class="input input-bordered"
          bind:value={name}
          onkeypress={handleKeyPress}
          disabled={isLoading}
        />
      </div>

      <div class="form-control mt-4">
        <label class="label">
          <span class="label-text">Username</span>
        </label>
        <input
          type="text"
          placeholder="Choose a username"
          class="input input-bordered"
          bind:value={username}
          onkeypress={handleKeyPress}
          disabled={isLoading}
        />
      </div>

      <div class="form-control mt-4">
        <label class="label">
          <span class="label-text">Password</span>
        </label>
        <input
          type="password"
          placeholder="Create a password"
          class="input input-bordered"
          bind:value={password}
          onkeypress={handleKeyPress}
          disabled={isLoading}
        />
      </div>

      <div class="form-control mt-4">
        <label class="label">
          <span class="label-text">Confirm Password</span>
        </label>
        <input
          type="password"
          placeholder="Confirm your password"
          class="input input-bordered"
          bind:value={confirmPassword}
          onkeypress={handleKeyPress}
          disabled={isLoading}
        />
      </div>

      <div class="form-control mt-6">
        <button
          class="btn btn-primary"
          onclick={handleRegister}
          disabled={isLoading || !name.trim() || !username.trim() || !password.trim() || !confirmPassword.trim()}
        >
          {#if isLoading}
            <span class="loading loading-spinner"></span>
            Creating account...
          {:else}
            Sign Up
          {/if}
        </button>
      </div>

      <div class="text-center mt-4">
        <p class="text-sm text-base-content/60">
          Already have an account?
          <a href="/login" class="link link-primary">Sign in</a>
        </p>
      </div>
    </div>
  </div>
</div>
