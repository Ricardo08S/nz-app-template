<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import Icon from "@iconify/svelte";
  import { errorMessage, toast } from "$lib";
  import { client } from "$lib/client.svelte";
  import { user } from "$lib/stores/user.svelte";
  import Container from "$lib/components/Container.svelte";

  const currentUser = user();

  let name = $state(currentUser.name);
  let username = $state(currentUser.username);
  let email = $state(currentUser.email ?? "");
  let isSubmitting = $state(false);

  const isInvalid = $derived(!name.trim() || !username.trim());

  const userUpdateQ = client.user.useUpdate();

  const handleCancel = () => goto(resolve("/profile/"));

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    if (isInvalid) return;
    isSubmitting = true;
    try {
      await userUpdateQ.mutateAsync({
        where: { id: currentUser.id },
        data: {
          name: name.trim(),
          username: username.trim(),
          email: email.trim() || null,
        },
      });
      toast.success("Profile updated!");
      goto(resolve("/profile/"));
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(errorMessage(error, "Failed to update profile"));
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

    <h1 class="text-3xl font-bold">Edit Profile</h1>

    <form onsubmit={handleSubmit} class="mt-6">
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body gap-4">
          <label class="form-control">
            <span class="label-text mb-1">Full name</span>
            <input
              type="text"
              class="input input-bordered w-full"
              bind:value={name}
              disabled={isSubmitting}
              required
            />
          </label>

          <label class="form-control">
            <span class="label-text mb-1">Username</span>
            <input
              type="text"
              class="input input-bordered w-full"
              bind:value={username}
              disabled={isSubmitting}
              required
            />
          </label>

          <label class="form-control">
            <span class="label-text mb-1">Email</span>
            <input
              type="email"
              class="input input-bordered w-full"
              bind:value={email}
              disabled={isSubmitting}
            />
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
            <Icon icon="heroicons:check" class="h-4 w-4" />
            Save Changes
          {/if}
        </button>
      </div>
    </form>
  </div>
</Container>
