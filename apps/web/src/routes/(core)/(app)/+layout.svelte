<script lang="ts">
  import Footer from "./_/Footer.svelte";
  import Navbar from "./_/Navbar.svelte";
  import Sidebar from "./_/Sidebar.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { client } from "$lib/client.svelte";
  import { user } from "$lib/stores/user.svelte";
  import type { SidebarItem } from "./_/lib";

  let { children } = $props();

  const items: SidebarItem[] = $derived([
    { _type: "single", icon: "heroicons:home", label: "Dashboard", href: resolve("/") },
    { _type: "divider" },
    { _type: "single", icon: "heroicons:user", label: "My Profile", href: resolve("/profile/") },
  ]);

  const currentUser = $derived(user());
  const meQ = client.user.useFindUnique(() => ({
    where: { id: currentUser.id },
    select: { oidc_issuer: true, passwordHash: true },
  }));
  const needsPasswordSetup = $derived(!!meQ.data?.oidc_issuer && !meQ.data?.passwordHash);
  const setupPasswordPath = resolve("/setup-password/");

  $effect(() => {
    if (needsPasswordSetup && page.url.pathname !== setupPasswordPath) {
      goto(setupPasswordPath);
    }
  });
</script>

<div class="drawer lg:drawer-open">
  <input id="app-drawer" type="checkbox" class="drawer-toggle" />
  <div class="drawer-content">
    <div class="sticky top-0 z-40">
      <Navbar />
    </div>
    <main class="min-h-screen">
      {#if !needsPasswordSetup || page.url.pathname === setupPasswordPath}
        {@render children()}
      {/if}
    </main>
    <Footer />
  </div>
  <div class="drawer-side z-50">
    <Sidebar {items} />
  </div>
</div>
