<script lang="ts">
  import { uploadFile, getFileUrl } from "$lib";
  import { client } from "$lib/client.svelte";
  import Query from "$lib/components/Query.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  import { usePagination } from "$lib/stores/pagination.svelte";
  import { user } from "$lib/stores/user.svelte";
  import { toast } from "$lib";
  import Container from "$lib/components/Container.svelte";

  const pagination = usePagination(10);

  const postsCountQ = client.post.useCount(() => ({ where: {} }));

  const postsQ = client.post.useFindMany(() => ({
    where: {},
    include: {
      User: true,
      Image: true,
    },
    orderBy: { createdAt: "desc" },
    skip: pagination.skip,
    take: pagination.take,
  }));

  let postContent = $state("");
  let postImage: File | null = $state(null);
  let isSubmitting = $state(false);

  const postCreateQ = client.post.useCreate();
  const postUpdateQ = client.post.useUpdate();
  const postDeleteQ = client.post.useDelete();

  const onPostSubmit = async () => {
    if (!postContent.trim()) {
      toast.error("Post content is required");
      return;
    }

    isSubmitting = true;
    try {
      let imageKey: string | undefined;

      // Upload image if provided
      if (postImage) {
        const result = await uploadFile({
          file: postImage,
          prefix: "posts",
        });
        imageKey = result.key;
      }

      // Create post
      await postCreateQ.mutateAsync({
        data: {
          userId: user().id,
          content: postContent,
          imageKey,
        },
      });

      // Reset form
      postContent = "";
      postImage = null;

      toast.success("Post created successfully!");
      postsQ.refetch();
    } catch (error) {
      console.error("Error creating post:", error);
      toast.error("Failed to create post");
    } finally {
      isSubmitting = false;
    }
  };

  const handleFileChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      postImage = target.files[0];
    }
  };

  // Edit state
  let editingPostId = $state<string | null>(null);
  let editContent = $state("");
  let isUpdating = $state(false);

  const startEdit = (postId: string, content: string) => {
    editingPostId = postId;
    editContent = content;
  };

  const cancelEdit = () => {
    editingPostId = null;
    editContent = "";
  };

  const onPostUpdate = async (postId: string) => {
    if (!editContent.trim()) {
      toast.error("Post content is required");
      return;
    }

    isUpdating = true;
    try {
      await postUpdateQ.mutateAsync({
        where: { id: postId },
        data: { content: editContent },
      });
      editingPostId = null;
      editContent = "";
      toast.success("Post updated successfully!");
      postsQ.refetch();
    } catch (error) {
      console.error("Error updating post:", error);
      toast.error("Failed to update post");
    } finally {
      isUpdating = false;
    }
  };

  const onPostDelete = async (postId: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
      await postDeleteQ.mutateAsync({ where: { id: postId } });
      toast.success("Post deleted successfully!");
      postsQ.refetch();
    } catch (error) {
      console.error("Error deleting post:", error);
      toast.error("Failed to delete post");
    }
  };
</script>

<Container>
  <div class="card bg-base-100 shadow-xl my-4">
    <div class="card-body">
      <h2 class="card-title">Create a Post</h2>
      <textarea
        class="textarea textarea-bordered w-full"
        placeholder="What's on your mind?"
        bind:value={postContent}
        rows="3"
      ></textarea>

      <div class="form-control">
        <label class="label">
          <span class="label-text">Add an image (optional)</span>
        </label>
        <input
          type="file"
          class="file-input file-input-bordered w-full"
          accept="image/*"
          onchange={handleFileChange}
        />
        {#if postImage}
          <label class="label">
            <span class="label-text-alt">Selected: {postImage.name}</span>
          </label>
        {/if}
      </div>

      <div class="card-actions justify-end">
        <button
          class="btn btn-primary"
          onclick={onPostSubmit}
          disabled={isSubmitting || !postContent.trim()}
        >
          {isSubmitting ? "Posting..." : "Post"}
        </button>
      </div>
    </div>
  </div>

  <Query q={postsQ}>
    {#snippet children(data)}
      <div class="space-y-4">
        <h2 class="text-2xl font-bold">Posts</h2>
        {#if data.length === 0}
          <div class="alert">
            <span>No posts yet. Be the first to post!</span>
          </div>
        {:else}
          {#each data as post}
            <div class="card bg-base-100 shadow-xl">
              <div class="card-body">
                <div class="flex items-center gap-2 mb-2">
                  <span class="font-semibold">{post.User.name}</span>
                  <span class="text-sm text-gray-500">
                    @{post.User.username}
                  </span>
                  <span class="text-sm text-gray-400">
                    {new Date(post.createdAt).toLocaleDateString()}
                  </span>
                  {#if post.userId === user().id || true}
                    <div class="ml-auto flex gap-2">
                      <button
                        class="btn btn-sm btn-ghost"
                        onclick={() => startEdit(post.id, post.content)}
                      >
                        Edit
                      </button>
                      <button
                        class="btn btn-sm btn-ghost text-error"
                        onclick={() => onPostDelete(post.id)}
                      >
                        Delete
                      </button>
                    </div>
                  {/if}
                </div>

                {#if editingPostId === post.id}
                  <div class="space-y-2">
                    <textarea
                      class="textarea textarea-bordered w-full"
                      bind:value={editContent}
                      rows="3"
                    ></textarea>
                    <div class="flex gap-2 justify-end">
                      <button
                        class="btn btn-sm btn-ghost"
                        onclick={cancelEdit}
                        disabled={isUpdating}
                      >
                        Cancel
                      </button>
                      <button
                        class="btn btn-sm btn-primary"
                        onclick={() => onPostUpdate(post.id)}
                        disabled={isUpdating || !editContent.trim()}
                      >
                        {isUpdating ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                {:else}
                  <p class="whitespace-pre-wrap">{post.content}</p>
                {/if}

                {#if post.Image}
                  <figure class="mt-4">
                    <img src={getFileUrl(post.Image.key)} alt="Post" class="rounded-lg w-sm h-sm" />
                  </figure>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
        <Pagination {pagination} totalItems={postsCountQ.data ?? 0} pageSizeOptions={[5, 10, 25]} />
      </div>
    {/snippet}
  </Query>
</Container>
