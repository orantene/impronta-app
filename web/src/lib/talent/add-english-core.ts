/**
 * TUL-361: the accept half of "Add English", with injected deps so the
 * "only the en key, never an overwrite" rule is testable without a database.
 * The server action in `add-english-actions.ts` supplies the real deps, scoped
 * to the signed-in talent's own profile.
 */
import {
  clampEnglish,
  withEnglishCaption,
  withEnglishMap,
  type MissingEnglishKind,
} from "./missing-english";

export type AddEnglishDeps = {
  /**
   * Owner-scoped read of the stored value: the photo's metadata, or the
   * offering's title_i18n / category_i18n. Null when the row is not this
   * talent's (another talent's id reads as "not found").
   */
  readStored: (kind: MissingEnglishKind, id: string) => Promise<{ stored: unknown } | null>;
  /** Owner-scoped write of the whole new value; false when no row matched or the write failed. */
  writeStored: (kind: MissingEnglishKind, id: string, value: unknown) => Promise<boolean>;
};

export type AddEnglishErrorCode = "invalid" | "not_found" | "already_has_english" | "unsupported" | "save_failed";

export type AddEnglishResult = { ok: true; text: string } | { ok: false; code: AddEnglishErrorCode };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function acceptEnglish(
  deps: AddEnglishDeps,
  input: { kind: MissingEnglishKind; id: string; text: string },
): Promise<AddEnglishResult> {
  if (input.kind === "ticker_item") return { ok: false, code: "unsupported" };
  if (
    (input.kind !== "photo_caption" && input.kind !== "service_title" && input.kind !== "service_category") ||
    typeof input.id !== "string" ||
    !UUID_RE.test(input.id) ||
    typeof input.text !== "string"
  ) {
    return { ok: false, code: "invalid" };
  }
  const text = clampEnglish(input.kind, input.text);
  if (!text) return { ok: false, code: "invalid" };

  const row = await deps.readStored(input.kind, input.id);
  if (!row) return { ok: false, code: "not_found" };

  const next = input.kind === "photo_caption" ? withEnglishCaption(row.stored, text) : withEnglishMap(row.stored, text);
  if (!next) return { ok: false, code: "already_has_english" };

  const wrote = await deps.writeStored(input.kind, input.id, next);
  return wrote ? { ok: true, text } : { ok: false, code: "save_failed" };
}
