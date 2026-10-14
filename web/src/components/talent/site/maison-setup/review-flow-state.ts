/**
 * TUL-658: pure decisions for the Review step.
 *
 * `loading` is the review state read (and any other non-publish transition);
 * `publishing` is only the Publish click. The label must follow `publishing`,
 * or it reads "Publicando…" while the preview is still loading.
 */
export function reviewPublishButton(input: {
  loading: boolean;
  publishing: boolean;
  ready: boolean;
  applyBusy: boolean;
}): { showPublishing: boolean; disabled: boolean } {
  return {
    showPublishing: input.publishing,
    disabled: input.loading || input.publishing || !input.ready || input.applyBusy,
  };
}

/** Where Undo lands: the site page on a live site (where she came from), else Theme detail. */
export function reviewUndoDestination(input: { siteLive: boolean }): "site" | "detail" {
  return input.siteLive ? "site" : "detail";
}
