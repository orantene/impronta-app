"use server";

/**
 * TUL-361 "Add English" for the signed-in talent's own content (photo captions,
 * service titles, service categories). Three steps, none of which writes the
 * English without the talent's explicit accept:
 *   1. loadMissingEnglishAction: the list of fields with no English.
 *   2. suggestEnglishAction: ONE suggestion through the existing talent AI
 *      translate engine (cache, feature flags, usage gate, daily cap and usage
 *      accounting all live in `translateTalentField`). The source text is read
 *      from the database here, never taken from the client.
 *   3. acceptEnglishAction: writes ONLY the `en` key of the field the talent
 *      reviewed; never overwrites a non-empty `en`, never touches the primary.
 * Ticker items are listed by the pure collector but not wired here yet.
 */
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { loadTalentLocaleSettings } from "@/lib/site-admin/server/talent-locale-settings";
import { translateTalentField, type TranslateTalentFieldErrorCode } from "@/lib/server-actions/translate-talent-field";
import { isTalentTranslateLocale, type TalentTranslateField } from "@/lib/translation/talent-field-translate";
import { acceptEnglish, type AddEnglishErrorCode } from "./add-english-core";
import { addEnglishDeps, loadEnglishSources } from "./add-english-store.server";
import { collectMissingEnglish, type MissingEnglishField, type MissingEnglishKind } from "./missing-english";
import { loadOwnTalentProfileId } from "./talent-languages-store";

export type MissingEnglishLoad =
  | { ok: true; primary: string; fields: MissingEnglishField[] }
  | { ok: false };

export type SuggestEnglishResult =
  | { ok: true; text: string }
  | { ok: false; code: TranslateTalentFieldErrorCode | "not_found" | "unsupported" | "read_only" };

export type AcceptEnglishResult = { ok: true; text: string } | { ok: false; code: AddEnglishErrorCode | "read_only" };

const TRANSLATE_FIELD: Partial<Record<MissingEnglishKind, TalentTranslateField>> = {
  service_title: "offering_title",
  service_category: "variant_label",
  photo_caption: "builder_text",
};

async function ownProfileId(): Promise<string | null> {
  const session = await getCachedActorSession();
  if (!session?.user) return null;
  return loadOwnTalentProfileId(session.user.id);
}

async function collectFor(profileId: string): Promise<{ primary: string; fields: MissingEnglishField[] } | null> {
  const [settings, sources] = await Promise.all([loadTalentLocaleSettings(profileId), loadEnglishSources(profileId)]);
  if (!sources) return null;
  const primary = settings.defaultLocale;
  return { primary, fields: collectMissingEnglish({ primary, ...sources }) };
}

/** Every field of the signed-in talent that has own-language text and no English. */
export async function loadMissingEnglishAction(): Promise<MissingEnglishLoad> {
  try {
    const profileId = await ownProfileId();
    if (!profileId) return { ok: false };
    const res = await collectFor(profileId);
    return res ? { ok: true, ...res } : { ok: false };
  } catch (err) {
    logServerError("addEnglish.load", err);
    return { ok: false };
  }
}

/** One English suggestion for one missing field. A draft only: nothing is saved. */
export async function suggestEnglishAction(input: {
  kind: MissingEnglishKind;
  id: string;
  path: string;
}): Promise<SuggestEnglishResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, code: "read_only" };
  const field = TRANSLATE_FIELD[input?.kind];
  if (!field) return { ok: false, code: "unsupported" };
  try {
    const profileId = await ownProfileId();
    if (!profileId) return { ok: false, code: "invalid" };
    const res = await collectFor(profileId);
    const hit = res?.fields.find((f) => f.kind === input.kind && f.id === input.id && f.path === (input.path ?? ""));
    if (!res || !hit) return { ok: false, code: "not_found" };
    if (!isTalentTranslateLocale(res.primary)) return { ok: false, code: "invalid" };
    const out = await translateTalentField({ field, from: res.primary, to: "en", text: hit.source });
    return out.ok ? { ok: true, text: out.text } : { ok: false, code: out.code };
  } catch (err) {
    logServerError("addEnglish.suggest", err);
    return { ok: false, code: "error" };
  }
}

/** Saves the English the talent reviewed. Adds the `en` key only. */
export async function acceptEnglishAction(input: {
  kind: MissingEnglishKind;
  id: string;
  text: string;
}): Promise<AcceptEnglishResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, code: "read_only" };
  try {
    const profileId = await ownProfileId();
    if (!profileId) return { ok: false, code: "not_found" };
    const deps = addEnglishDeps(profileId);
    if (!deps) return { ok: false, code: "save_failed" };
    return await acceptEnglish(deps, input);
  } catch (err) {
    logServerError("addEnglish.accept", err);
    return { ok: false, code: "save_failed" };
  }
}
