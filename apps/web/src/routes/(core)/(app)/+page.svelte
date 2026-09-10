<script lang="ts">
  import Container from "$lib/components/Container.svelte";
  import { user } from "$lib/stores/user.svelte";
</script>

<Container>
  <h2 class="mb-6 text-2xl font-bold">Dashboard</h2>
  <p>Welcome, {user().name}.</p>
</Container>
