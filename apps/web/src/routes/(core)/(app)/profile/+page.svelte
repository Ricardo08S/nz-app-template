<script lang="ts">
  import Icon from "@iconify/svelte";
  import { user } from "$lib/stores/user.svelte";
  import Card from "../_/ui/Card.svelte";

  const currentUser = $derived(user());

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
    <div class="mb-8">
      <h1 class="mb-2 text-2xl font-bold">Profile</h1>
      <p class="text-sm text-base-content/70">View your account information</p>
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
