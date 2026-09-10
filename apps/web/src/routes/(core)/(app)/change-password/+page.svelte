<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import Icon from "@iconify/svelte";
  import { errorMessage, toast } from "$lib";
  import { trpc } from "$lib/client.svelte";
  import Container from "$lib/components/Container.svelte";

  let oldPassword = $state("");
  let newPassword = $state("");
  let retypePassword = $state("");
  let isSubmitting = $state(false);

  const retypeMatches = $derived(!retypePassword || retypePassword === newPassword);
  const isInvalid = $derived(!oldPassword || !newPassword || !retypeMatches);

  const handleCancel = () => goto(resolve("/profile/"));

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    if (isInvalid) return;
    isSubmitting = true;
    try {
      await trpc.changePassword.mutate({ oldPassword, newPassword });
      toast.success("Password changed!");
      goto(resolve("/profile/"));
    } catch (error) {
      console.error("Error changing password:", error);
      toast.error(errorMessage(error, "Failed to change password"));
    } finally {
      isSubmitting = false;
    }
  };
</script>

<Container>
  <div class="mx-auto max-w-xl">
    <button class="btn btn-ghost btn-sm mb-4 gap-1" onclick={handleCancel}>
      <Icon icon="heroicons:arrow-left" class="h-4 w-4" />
      Back to profile
    </button>

    <h1 class="text-3xl font-bold">Change Password</h1>

    <form onsubmit={handleSubmit} class="mt-6">
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body gap-4">
          <label class="form-control">
            <span class="label-text mb-1">Current Password</span>
            <input
              type="password"
              class="input input-bordered w-full"
              bind:value={oldPassword}
              disabled={isSubmitting}
            />
          </label>

          <label class="form-control">
            <span class="label-text mb-1">New Password</span>
            <input
              type="password"
              class="input input-bordered w-full"
              bind:value={newPassword}
              disabled={isSubmitting}
            />
          </label>

          <label class="form-control">
            <span class="label-text mb-1">Retype New Password</span>
            <input
              type="password"
              class="input input-bordered w-full {retypePassword && !retypeMatches
                ? 'input-error'
                : ''}"
              bind:value={retypePassword}
              disabled={isSubmitting}
            />
            {#if retypePassword && !retypeMatches}
              <span class="label-text-alt mt-1 text-error">Passwords do not match</span>
            {/if}
          </label>
        </div>
      </div>

      <div class="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
        <button
          type="button"
          class="btn btn-outline"
          onclick={handleCancel}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button type="submit" class="btn btn-primary gap-2" disabled={isSubmitting || isInvalid}>
          {#if isSubmitting}
            <span class="loading loading-spinner loading-sm"></span>
            Saving...
          {:else}
            <Icon icon="heroicons:key" class="h-4 w-4" />
            Change Password
          {/if}
        </button>
      </div>
    </form>
  </div>
</Container>
