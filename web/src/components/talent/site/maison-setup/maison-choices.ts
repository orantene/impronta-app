/**
 * Maison setup choices (W32–W33) — persist palette / content mode / screen so
 * close → reopen resumes. Apply writes live in maison-apply-actions (PR5).
 */
import type { MaisonPaletteKey } from "@/lib/talent-site/theme-catalog/maison/seed";
import {
  MAISON_DEFAULT_PALETTE_KEY,
  MAISON_PALETTE_ORDER,
} from "@/lib/talent-site/theme-catalog/maison/seed";
import type { MaisonPreviewContentMode } from "@/lib/talent-site/theme-catalog/maison/preview-hydration";

export type MaisonSetupScreen = "gallery" | "detail" | "review";
export type MaisonPreviewDevice = "desktop" | "phone";
export type MaisonStatusWord = "Preview" | "Choices saved" | "Draft saved" | "Live";
export type MaisonPhoneSheet = null | "demos" | "colors";

export type MaisonSetupChoices = {
  screen: MaisonSetupScreen;
  paletteKey: MaisonPaletteKey;
  contentMode: MaisonPreviewContentMode;
  previewDevice: MaisonPreviewDevice;
  status: MaisonStatusWord;
  phoneSheet: MaisonPhoneSheet;
};

export const MAISON_CHOICES_STORAGE_PREFIX = "maison-setup-choices:";

export function defaultMaisonChoices(): MaisonSetupChoices {
  return {
    screen: "gallery",
    paletteKey: MAISON_DEFAULT_PALETTE_KEY,
    contentMode: "demo",
    previewDevice: "desktop",
    status: "Preview",
    phoneSheet: null,
  };
}

export function isMaisonPaletteKey(value: string): value is MaisonPaletteKey {
  return (MAISON_PALETTE_ORDER as readonly string[]).includes(value);
}

/** Pure parse — used by tests and storage loaders. */
export function parseMaisonChoices(raw: unknown): MaisonSetupChoices {
  const base = defaultMaisonChoices();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const screen =
    o.screen === "detail" || o.screen === "review" ? o.screen : "gallery";
  const paletteKey =
    typeof o.paletteKey === "string" && isMaisonPaletteKey(o.paletteKey)
      ? o.paletteKey
      : base.paletteKey;
  const contentMode = o.contentMode === "mine" ? "mine" : "demo";
  const previewDevice = o.previewDevice === "phone" ? "phone" : "desktop";
  const status: MaisonStatusWord =
    o.status === "Choices saved" ||
    o.status === "Draft saved" ||
    o.status === "Live" ||
    o.status === "Preview"
      ? o.status
      : "Preview";
  return {
    screen,
    paletteKey,
    contentMode,
    previewDevice,
    status,
    phoneSheet: null, // sheets never persist across reopen
  };
}

export function choicesStorageKey(talentProfileId: string): string {
  return `${MAISON_CHOICES_STORAGE_PREFIX}${talentProfileId}`;
}

export function loadMaisonChoices(talentProfileId: string): MaisonSetupChoices {
  if (typeof window === "undefined") return defaultMaisonChoices();
  try {
    const raw = window.localStorage.getItem(choicesStorageKey(talentProfileId));
    if (!raw) return defaultMaisonChoices();
    return parseMaisonChoices(JSON.parse(raw) as unknown);
  } catch {
    return defaultMaisonChoices();
  }
}

export function saveMaisonChoices(
  talentProfileId: string,
  choices: MaisonSetupChoices,
): void {
  if (typeof window === "undefined") return;
  try {
    const { phoneSheet: _sheet, ...persistable } = choices;
    window.localStorage.setItem(
      choicesStorageKey(talentProfileId),
      JSON.stringify(persistable),
    );
  } catch {
    // quota / private mode — choices stay in-memory for the session
  }
}
