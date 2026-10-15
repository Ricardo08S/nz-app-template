<script lang="ts">
  import Footer from "./_/Footer.svelte";
  import Navbar from './_/Navbar.svelte';

  let {children} = $props();
</script>

<Navbar />

<main class="min-h-screen">
  {@render children()}
</main>

<Footer />
