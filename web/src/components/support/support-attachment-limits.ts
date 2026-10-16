/** Single source of truth for support attachment limits (thread + new ticket). */
export const SUPPORT_ATTACH_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
export const SUPPORT_ATTACH_MAX_BYTES = 5 * 1024 * 1024;
/** A new ticket may stage a few files; each one obeys the per-file limits. */
export const SUPPORT_NEW_TICKET_MAX_FILES = 3;

export type StagedFile = { name: string; type: string; size: number };

export function isAcceptableSupportAttachment(file: StagedFile): boolean {
  return (
    file.size > 0 &&
    file.size <= SUPPORT_ATTACH_MAX_BYTES &&
    SUPPORT_ATTACH_ACCEPT.split(",").includes(file.type)
  );
}

/** Adds picked files to the staged list; returns the new list and whether any was rejected. */
export function stageSupportAttachments<T extends StagedFile>(
  current: readonly T[],
  picked: readonly T[],
): { files: T[]; rejected: boolean } {
  const files = [...current];
  let rejected = false;
  for (const f of picked) {
    if (!isAcceptableSupportAttachment(f) || files.length >= SUPPORT_NEW_TICKET_MAX_FILES) {
      rejected = true;
      continue;
    }
    files.push(f);
  }
  return { files, rejected };
}

/** Uploads each staged file to a freshly created ticket; returns how many failed. */
export async function uploadStagedAttachments<T extends StagedFile>(
  ticketId: string,
  files: readonly T[],
  upload: (ticketId: string, file: T) => Promise<boolean>,
): Promise<number> {
  let failed = 0;
  for (const f of files) {
    try {
      if (!(await upload(ticketId, f))) failed += 1;
    } catch {
      failed += 1;
    }
  }
  return failed;
}
