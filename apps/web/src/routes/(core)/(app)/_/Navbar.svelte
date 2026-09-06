<script lang="ts">
  import { resolve } from "$app/paths";
  import Icon from "@iconify/svelte";
  import { constants } from "../../../_/constants";
  import { type NavSingle } from "./lib";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import { user } from "$lib/stores/user.svelte";

  const { brandName } = constants;
  const brandHref = resolve("/");

  const accountDropdownItems: NavSingle[] = [
    { _type: "single", label: "Profile", href: resolve("/profile/") },
    { _type: "single", label: "Logout", href: resolve("/logout") },
  ];
</script>

<div class="bg-base-300 shadow-lg">
  <div class="navbar container mx-auto">
    <div class="navbar-start gap-2">
      <label for="app-drawer" aria-label="open sidebar" class="btn btn-ghost btn-square lg:hidden">
        <Icon icon="heroicons:bars-3" class="h-5 w-5" />
      </label>
      <a href={brandHref} class="btn gap-2 text-xl btn-ghost">
        <Icon icon="heroicons:cube" class="h-6 w-6" />
        {brandName}
      </a>
    </div>

    <div class="navbar-end gap-2">
      <ThemeToggle />

      <!-- Account dropdown -->
      <div class="dropdown dropdown-end">
        <div tabindex="0" role="button" class="btn btn-ghost">
          {#if user().image}
            <div class="avatar">
              <div class="w-6 rounded-full">
                <img src={user().image} alt={user().name} />
              </div>
            </div>
          {:else}
            <Icon icon="heroicons:user-circle" class="h-5 w-5" />
          {/if}
          <div class="hidden sm:inline">
            <span>{user().name}</span>
            {#if user().role !== "USER"}
              <span>({user().role})</span>
            {/if}
          </div>
        </div>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <ul tabindex="0" class="dropdown-content menu z-1 w-52 rounded-box bg-base-100 p-2 shadow">
          {#each accountDropdownItems as item (item.label)}
            <li><a href={item.href}>{item.label}</a></li>
          {/each}
        </ul>
      </div>
    </div>
  </div>
</div>
