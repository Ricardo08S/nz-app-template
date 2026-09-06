<script lang="ts">
  import { page } from "$app/state";
  import Icon from "@iconify/svelte";
  import type { SidebarItem } from "./lib";

  const { items }: { items: SidebarItem[] } = $props();

  function isActive(href: string): boolean {
    return href === "/" ? page.url.pathname === "/" : page.url.pathname.startsWith(href);
  }
</script>

<label for="app-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
<ul class="menu min-h-full w-64 bg-base-200 p-4 text-base-content">
  {#each items as item, i (item._type === "divider" ? `divider-${i}` : item.href)}
    {#if item._type === "single"}
      <li class="mb-1">
        <a href={item.href} class={isActive(item.href) ? "bg-primary text-primary-content" : ""}>
          {#if item.icon}
            <Icon icon={item.icon} class="h-5 w-5" />
          {/if}
          {item.label}
        </a>
      </li>
    {:else}
      <div class="divider my-1"></div>
    {/if}
  {/each}
</ul>
