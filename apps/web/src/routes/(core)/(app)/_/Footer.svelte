<script lang="ts">
  import { resolve } from "$app/paths";
  import Icon from "@iconify/svelte";
  import { constants } from "../../../_/constants";

  const { brandName } = constants;

  const currentYear = new Date().getFullYear();

  const quickLinks = [{ label: "Home", href: resolve("/") }];

  const resourceLinks = [{ label: "Nafkhanzam Website", href: "https://www.nafkhanzam.com" }];
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
        {brandName} is a nafkhanzam's template application. This footer needs to be updated.
      </p>
    </nav>
  </div>
</footer>
<footer class="border-t border-neutral-content/10 bg-neutral">
  <div
    class="container mx-auto flex flex-col items-center justify-between gap-4 px-10 py-4 text-neutral-content md:flex-row"
  >
    <aside class="flex items-center gap-4">
      <Icon icon="heroicons:academic-cap" class="h-6 w-6" />
      <p>
        <span class="font-semibold">{brandName}</span>
        <br />
        © {currentYear} All rights reserved.
      </p>
    </aside>
    <nav>
      <div class="flex gap-4">
        <a
          href="https://www.nafkhanzam.com"
          target="_blank"
          rel="noopener noreferrer"
          class="link link-hover"
          aria-label="Nafkhanzam Website"
        >
          <Icon icon="heroicons:globe-alt" class="h-6 w-6" />
        </a>
      </div>
    </nav>
  </div>
</footer>
