<script lang="ts">
  import Icon from "@iconify/svelte";
  import type { Pagination } from "$lib/stores/pagination.svelte";

  interface Props {
    pagination: Pagination;
    totalItems: number;
    pageSizeOptions?: number[];
  }

  let { pagination, totalItems, pageSizeOptions = [12, 24, 48, 96] }: Props = $props();

  const totalPages = $derived(Math.max(1, Math.ceil(totalItems / pagination.pageSize)));
  const startItem = $derived((pagination.page - 1) * pagination.pageSize + 1);
  const endItem = $derived(Math.min(pagination.page * pagination.pageSize, totalItems));

  function visiblePages(current: number, total: number): (number | "...")[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 3) return [1, 2, 3, 4, 5, "...", total];
    if (current >= total - 2) return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
    return [1, "...", current - 1, current, current + 1, "...", total];
  }

  const pages = $derived(visiblePages(pagination.page, totalPages));
</script>

<!-- Temporarily show all -->
{#if totalItems > 0 || true}
  <div class="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
    <!-- Page size -->
    <div class="flex items-center gap-2 text-sm">
      <span class="text-base-content/60">Tampilkan</span>
      <select
        class="select select-bordered select-sm w-20"
        value={pagination.pageSize}
        onchange={(e) => pagination.setPageSize(Number(e.currentTarget.value))}
      >
        {#each pageSizeOptions as opt (opt)}
          <option value={opt}>{opt}</option>
        {/each}
      </select>
      <span class="text-base-content/60">per halaman</span>
    </div>

    <!-- Info + controls -->
    <div class="flex items-center gap-4">
      <span class="text-sm text-base-content/60">
        {startItem}–{endItem} dari {totalItems}
      </span>

      <div class="join">
        <button
          class="btn btn-sm join-item"
          disabled={pagination.page === 1}
          onclick={() => pagination.setPage(pagination.page - 1)}
        >
          <Icon icon="heroicons:chevron-left" class="h-4 w-4" />
        </button>

        {#each pages as p, i (i)}
          {#if p === "..."}
            <button class="btn btn-sm join-item btn-disabled pointer-events-none">…</button>
          {:else}
            <button
              class="btn btn-sm join-item {pagination.page === p ? 'btn-primary' : ''}"
              onclick={() => pagination.setPage(p as number)}
            >
              {p}
            </button>
          {/if}
        {/each}

        <button
          class="btn btn-sm join-item"
          disabled={pagination.page === totalPages}
          onclick={() => pagination.setPage(pagination.page + 1)}
        >
          <Icon icon="heroicons:chevron-right" class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
{/if}
