<script lang="ts">
  import { client, trpc } from "$lib/client.svelte";
  import { toast } from "$lib";
  import { user } from "$lib/stores/user.svelte";
  import { refresh, token } from "$lib/stores/token.svelte";

  const usersQ = client.user.useFindMany(() => ({
    select: { id: true, username: true, name: true, role: true },
    orderBy: { username: "asc" },
  }));

  const canImpersonate = $derived(user().role === "ADMIN" && !user().impersonation);

  const onImpersonate = async (userId: string, name: string) => {
    if (!confirm(`Sign in as ${name}? You can switch back from the account menu.`)) return;
    try {
      const tokens = await trpc.impersonate.mutate({ userId });
      token.value = tokens.accessToken;
      refresh.value = tokens.refreshToken;
      // Full reload so no data cached for the admin leaks into the new session.
      window.location.reload();
    } catch (error) {
      console.error("Error impersonating user:", error);
      toast.error("Failed to impersonate user");
    }
  };
</script>

<div class="container mx-auto px-4 py-8">
  <h1 class="mb-6 text-2xl font-bold">Users</h1>
  <div class="overflow-x-auto">
    <table class="table">
      <thead>
        <tr><th>Username</th><th>Name</th><th>Role</th><th></th></tr>
      </thead>
      <tbody>
        {#each usersQ.data ?? [] as u (u.id)}
          <tr>
            <td>{u.username}</td>
            <td>{u.name}</td>
            <td>{u.role}</td>
            <td class="text-right">
              {#if canImpersonate && u.id !== user().id}
                <button class="btn btn-sm" onclick={() => onImpersonate(u.id, u.name)}>
                  Impersonate
                </button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
