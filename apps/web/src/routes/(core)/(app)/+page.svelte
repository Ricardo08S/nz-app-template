<script lang="ts">
  import { resolve } from "$app/paths";
  import Container from "$lib/components/Container.svelte";
</script>

<Container>
  <a href={resolve("/(core)/(app)/posts")} class="btn btn-link">Go to /posts</a>
</Container>
