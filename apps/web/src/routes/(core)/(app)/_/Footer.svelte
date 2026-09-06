<script lang="ts">
  import { resolve } from "$app/paths";
  import Icon from "@iconify/svelte";
  import { constants } from "../../../_/constants";

  const { brandName } = constants;

  const currentYear = new Date().getFullYear();

  const quickLinks = [
    { label: "Dashboard", href: resolve("/") },
    { label: "Profile", href: resolve("/profile/") },
  ];

  const resourceLinks: { label: string; href: string }[] = [];
</script>

<footer class="bg-neutral">
  <div
    class="footer container mx-auto grid grid-cols-2 gap-8 p-10 text-neutral-content md:grid-cols-4"
  >
    <nav>
      <h6 class="footer-title">Quick Links</h6>
      {#each quickLinks as link (link.label)}
        <a href={link.href} class="link link-hover">{link.label}</a>
      {/each}
    </nav>
    <nav>
      <h6 class="footer-title">Resources</h6>
      {#each resourceLinks as link (link.label)}
        <a href={link.href} target="_blank" rel="noopener noreferrer" class="link link-hover"
          >{link.label}</a
        >
      {/each}
    </nav>
    <nav class="md:col-span-2">
      <h6 class="footer-title">About</h6>
      <p class="max-w-md">
        {brandName} — replace this placeholder name and description before shipping.
      </p>
    </nav>
  </div>
</footer>
<footer class="border-t border-neutral-content/10 bg-neutral">
  <div
    class="container mx-auto flex flex-col items-center justify-between gap-4 px-10 py-4 text-neutral-content md:flex-row"
  >
    <aside class="flex items-center gap-4">
      <Icon icon="heroicons:cube" class="h-6 w-6" />
      <p>
        <span class="font-semibold">{brandName}</span>
        <br />
        © {currentYear}. All rights reserved.
      </p>
    </aside>
  </div>
</footer>
