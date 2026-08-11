import "server-only";

/**
 * drive-folder-diagnosis.ts — turn "No images found in this folder." into an
 * answer the operator can act on.
 *
 * THE BUG THIS EXISTS FOR (reported by a live client, 2026-08-11)
 * ──────────────────────────────────────────────────────────────
 * `actionListDriveFolder` asks Drive for
 *     '<folderId>' in parents and mimeType contains 'image/'
 * and, on an empty result, tells the operator "No images found in this folder."
 *
 * That sentence is wrong most of the time. The Drive REST call is authenticated
 * with an **API key**, which is ANONYMOUS access. An anonymous caller listing a
 * folder that is NOT shared as "Anyone with the link" does not get a 403 — it
 * gets **HTTP 200 with an empty file list**, because the query simply matches
 * nothing the caller may see. So the branch that carries the correct advice
 * (`if (!listRes.ok) → "make sure it is shared…"`) can never fire for the single
 * most likely cause, and the operator is told their folder is empty while they
 * are looking straight at the photos in it.
 *
 * Same failure class as a guard that asserts a proxy instead of the property:
 * the signal is real, the conclusion drawn from it is not. The fix is not a
 * better sentence, it is asking Drive the follow-up questions that separate the
 * causes:
 *
 *   1. Can we read the folder's metadata at all?  → sharing / bad link
 *   2. If yes, what is actually inside it?        → empty / subfolders / non-images
 *
 * `fetchImpl` is injectable so every branch is unit-testable without a network
 * call or an API key (the key only exists in the deployed environment).
 */

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

export type DriveDiagnosisReason =
  | "not_shared"
  | "not_a_folder"
  | "empty_folder"
  | "images_in_subfolders"
  | "no_image_files"
  | "unreachable";

export type DriveFolderDiagnosis = {
  /** Operator-facing sentence. Always names a next action. */
  message: string;
  /** Stable tag for logs + tests. */
  reason: DriveDiagnosisReason;
};

type DriveChild = { id?: string; name?: string; mimeType?: string };

/**
 * Explain why an image query against `folderId` came back empty.
 * Never throws: every failure path resolves to a diagnosis.
 */
export async function diagnoseEmptyDriveFolder(
  folderId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DriveFolderDiagnosis> {
  const key = encodeURIComponent(apiKey);

  // 1. Is the folder readable by an anonymous caller at all?
  //    Drive hides the existence of unshared items, so "not shared" usually
  //    surfaces as 404 rather than 403. Both mean the same thing to the
  //    operator, so both get the same actionable sentence.
  let metaRes: Response;
  try {
    metaRes = await fetchImpl(
      `${DRIVE_API}/${encodeURIComponent(folderId)}?fields=id,name,mimeType&key=${key}`,
    );
  } catch {
    return {
      reason: "unreachable",
      message: "Could not reach Google Drive. Check the connection and try again.",
    };
  }

  if (!metaRes.ok) {
    return {
      reason: "not_shared",
      message:
        "That folder is not shared publicly, so we cannot see inside it. In Google Drive open Share, set General access to \"Anyone with the link\", then paste the link again.",
    };
  }

  const meta = (await safeJson(metaRes)) as DriveChild | null;
  if (meta?.mimeType && meta.mimeType !== DRIVE_FOLDER_MIME) {
    return {
      reason: "not_a_folder",
      message:
        "That link points to a file, not a folder. Open the folder that holds the photos and copy the link from there.",
    };
  }

  // 2. Folder is readable. Say what is actually in it, so the operator is not
  //    left guessing. No mimeType filter here: the whole point is to see the
  //    things the image query filtered out.
  let allRes: Response;
  try {
    allRes = await fetchImpl(
      `${DRIVE_API}?q=${encodeURIComponent(`'${folderId}' in parents`)}` +
        `&fields=files(id,name,mimeType)&pageSize=200&key=${key}`,
    );
  } catch {
    return {
      reason: "unreachable",
      message: "Could not reach Google Drive. Check the connection and try again.",
    };
  }
  if (!allRes.ok) {
    return {
      reason: "not_shared",
      message:
        "We can see the folder but not its contents. In Google Drive open Share, set General access to \"Anyone with the link\", then paste the link again.",
    };
  }

  const body = (await safeJson(allRes)) as { files?: DriveChild[] } | null;
  const children = body?.files ?? [];

  if (children.length === 0) {
    return {
      reason: "empty_folder",
      message: "That folder is shared correctly, but there is nothing inside it.",
    };
  }

  const subfolders = children.filter((c) => c.mimeType === DRIVE_FOLDER_MIME);
  const nonFolders = children.filter((c) => c.mimeType !== DRIVE_FOLDER_MIME);

  // Subfolders are the common agency layout (a folder per model). The import
  // reads only what is DIRECTLY inside the pasted folder, so name that plainly
  // instead of letting it read as "your photos are missing".
  if (subfolders.length > 0 && nonFolders.length === 0) {
    const names = subfolders.slice(0, 3).map((f) => f.name).filter(Boolean).join(", ");
    return {
      reason: "images_in_subfolders",
      message:
        `That folder holds ${subfolders.length} subfolder(s)${names ? ` (${names})` : ""} and no photos directly inside. ` +
        "Import reads only the folder you paste, so open the subfolder with the photos and paste that link.",
    };
  }

  const kinds = [...new Set(nonFolders.map((f) => f.mimeType ?? "unknown"))].slice(0, 3);
  return {
    reason: subfolders.length > 0 ? "images_in_subfolders" : "no_image_files",
    message:
      `That folder holds ${nonFolders.length} file(s)${subfolders.length > 0 ? ` and ${subfolders.length} subfolder(s)` : ""}, ` +
      `but none of the files are images Drive recognises (found: ${kinds.join(", ")}). ` +
      (subfolders.length > 0
        ? "If the photos are in a subfolder, open it and paste that link."
        : "Re-upload the photos as JPEG, PNG or WebP and try again."),
  };
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
