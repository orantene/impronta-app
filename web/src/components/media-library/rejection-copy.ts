/**
 * rejection-copy — one place that turns engine rejection CODES into a line an
 * operator can read.
 *
 * `prepareUploadFiles` deliberately reports codes rather than strings so the
 * shared engine never hardcodes English. The cost of that is a mapper per
 * surface, and a surface that forgets one reproduces the failure this module
 * was written for: the builder's asset library advertised a Videos tab and a
 * `video/*` accept list, the engine dropped every video, and nothing on screen
 * said so. The switch below is exhaustive on purpose — a new code fails the
 * build here instead of going quiet in the UI.
 *
 * The Media page keeps its own richer mapper (it pluralizes counts and
 * interpolates caps against its own catalog); this is the compact one for the
 * builder drawers, which have a single-line notice.
 */

import type { PrepareRejection } from "@/lib/media/use-media-upload";

/** A folder drop can sweep up dozens of stray files; name a few, count the rest. */
export function namesForMessage(names: string[], show = 4): string {
  if (names.length <= show) return names.join(", ");
  return `${names.slice(0, show).join(", ")} +${names.length - show}`;
}

export function describeRejections(
  rejections: PrepareRejection[],
  t: (key: string) => string,
): string | null {
  if (rejections.length === 0) return null;
  const parts = rejections.map((r) => {
    switch (r.code) {
      case "unsupported_kind":
        return `${t("dashboard.mediaLibrary.errUnsupportedKind")} ${namesForMessage(r.names)}`;
      case "file_too_large":
        return `${t("dashboard.mediaLibrary.errFileTooLarge").replace("{max}", String(r.maxMb))} ${namesForMessage(r.names)}`;
      case "svg_skipped":
        return t("dashboard.mediaLibrary.errSvgSkipped");
      case "zip_too_large":
        return t("dashboard.mediaLibrary.errZipTooLarge");
      case "zip_unreadable":
        return t("dashboard.mediaLibrary.errZipUnreadable");
      case "zip_truncated":
        return t("dashboard.mediaLibrary.errZipTruncated");
      case "batch_too_large":
        return t("dashboard.mediaLibrary.errBatchTooLarge");
    }
  });
  return parts.join(" · ").slice(0, 300);
}
