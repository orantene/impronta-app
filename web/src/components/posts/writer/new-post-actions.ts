/**
 * new-post-actions.ts — lazy-create wrapper for the "new post" writer
 * (TUL-1249). The writer opens on a post that has no row yet; the first
 * action that needs a row (an autosave with content, a settings change, a
 * publish) creates it, and every later action reuses that id.
 */
import type { PostWriterActions } from "@/lib/cms/post-writer-types";
import type { PostLocale } from "@/lib/cms/posts-shared";
import type { PostDraftValues } from "@/lib/cms/posts-writer";
import type { PostWriterActionResult } from "@/lib/server-actions/posts-writer-actions";

export type CreateDraft = (input: { locale: PostLocale } & PostDraftValues) => Promise<PostWriterActionResult>;

export function makeLazyCreateActions(opts: {
  base: PostWriterActions;
  create: CreateDraft;
  postLocale: PostLocale;
  onCreated: (id: string) => void;
}): PostWriterActions {
  let createdId: string | null = null;
  let inflight: Promise<PostWriterActionResult> | null = null;

  const ensure = (values: PostDraftValues): Promise<PostWriterActionResult> => {
    if (!inflight) {
      inflight = opts.create({ locale: opts.postLocale, ...values }).then((res) => {
        if (res.ok) {
          createdId = res.data.id;
          opts.onCreated(res.data.id);
        } else {
          inflight = null; // allow a retry after a failed create
        }
        return res;
      });
    }
    return inflight;
  };

  const withId = async (
    id: string,
    run: (realId: string) => Promise<PostWriterActionResult>,
  ): Promise<PostWriterActionResult> => {
    if (id) return run(id);
    if (createdId) return run(createdId);
    const made = await ensure({});
    return made.ok ? run(made.data.id) : made;
  };

  return {
    save: async (input) => {
      const { id, ...values } = input;
      if (id || createdId) return opts.base.save({ id: id || (createdId as string), ...values });
      const hadCreate = inflight !== null;
      const made = await ensure(values);
      if (!made.ok || !hadCreate) return made; // first save: the create already carried the values
      return opts.base.save({ id: made.data.id, ...values });
    },
    updateSettings: (input) => withId(input.id, (id) => opts.base.updateSettings({ ...input, id })),
    publish: (input) => withId(input.id, (id) => opts.base.publish({ ...input, id })),
    unpublish: (input) => withId(input.id, (id) => opts.base.unpublish({ ...input, id })),
  };
}
