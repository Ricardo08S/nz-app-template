<script lang="ts">
    import InternalError from '$lib/components/InternalError.svelte';
  import { user } from '$lib/stores/user.svelte';

  let {children} = $props();

  const allow = $derived(user().role === "ADMIN");
</script>

{#if allow}
  {@render children()}
{:else}
  <InternalError statusCode={403} message="Forbidden" />
{/if}
