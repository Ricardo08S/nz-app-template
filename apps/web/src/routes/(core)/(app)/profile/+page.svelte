<script lang="ts">
  import { resolve } from "$app/paths";
  import Icon from "@iconify/svelte";
  import { client } from "$lib/client.svelte";
  import { user } from "$lib/stores/user.svelte";
  import Card from "../_/ui/Card.svelte";

  const currentUser = $derived(user());

  const userQ = client.user.useFindUnique(() => ({
    where: { id: currentUser.id },
    select: { oidc_issuer: true, passwordHash: true },
  }));
  const isOidcUser = $derived(!!userQ.data?.oidc_issuer);
  const needsPasswordSetup = $derived(isOidcUser && !userQ.data?.passwordHash);

  function getRoleBadgeClass(role: string) {
    switch (role) {
      case "ADMIN":
        return "badge-error";
      case "USER":
        return "badge-primary";
      default:
        return "badge-ghost";
    }
  }

  function getRoleLabel(role: string) {
    switch (role) {
      case "ADMIN":
        return "Admin";
      case "USER":
        return "User";
      default:
        return role;
    }
  }
</script>

<div class="min-h-screen bg-base-100">
  <div class="container mx-auto px-4 py-8">
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="mb-2 text-2xl font-bold">Profile</h1>
        <p class="text-sm text-base-content/70">View your account information</p>
      </div>
      <div class="flex gap-2">
        {#if needsPasswordSetup}
          <a href={resolve("/setup-password/")} class="btn btn-outline btn-sm gap-2">
            <Icon icon="heroicons:key" class="h-4 w-4" />
            Set Up Password
          </a>
        {:else}
          <a href={resolve("/change-password/")} class="btn btn-outline btn-sm gap-2">
            <Icon icon="heroicons:key" class="h-4 w-4" />
            Change Password
          </a>
        {/if}
      </div>
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <Card title="Account Information">
        <div class="flex flex-col items-center gap-4 py-4">
          {#if currentUser.image}
            <div class="avatar">
              <div class="w-24 rounded-full">
                <img src={currentUser.image} alt={currentUser.name} />
              </div>
            </div>
          {:else}
            <div class="avatar placeholder">
              <div
                class="w-24 rounded-full bg-primary text-primary-content flex justify-center items-center"
              >
                <span class="text-3xl">{currentUser.name.charAt(0).toUpperCase()}</span>
              </div>
            </div>
          {/if}
          <div class="text-center">
            <h2 class="text-xl font-bold">{currentUser.name}</h2>
            <p class="text-base-content/70">@{currentUser.username}</p>
            <div class="mt-2">
              <span class="badge {getRoleBadgeClass(currentUser.role)}">
                {getRoleLabel(currentUser.role)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Profile Details">
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-base-200">
              <Icon icon="heroicons:user" class="h-5 w-5 text-primary" />
            </div>
            <div>
              <p class="text-xs text-base-content/60">Full Name</p>
              <p class="font-medium">{currentUser.name}</p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-base-200">
              <Icon icon="heroicons:at-symbol" class="h-5 w-5 text-primary" />
            </div>
            <div>
              <p class="text-xs text-base-content/60">Username</p>
              <p class="font-medium">{currentUser.username}</p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-base-200">
              <Icon icon="heroicons:envelope" class="h-5 w-5 text-primary" />
            </div>
            <div>
              <p class="text-xs text-base-content/60">Email</p>
              <p class="font-medium">{currentUser.email || "-"}</p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-base-200">
              <Icon icon="heroicons:shield-check" class="h-5 w-5 text-primary" />
            </div>
            <div>
              <p class="text-xs text-base-content/60">Role</p>
              <p class="font-medium">{getRoleLabel(currentUser.role)}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </div>
</div>
