/**
 * Maison setup choices (W32–W33, W75 / AUD-023) — persist palette / content
 * mode / screen so close → reopen resumes. Server column
 * `talent_sites.setup_choices` is the source of truth; localStorage is a
 * same-device cache. Apply writes live in maison-apply-actions (PR5).
 * Custom colors (W60–W64) persist as `customPalette` when saved.
 */
import type { MaisonPaletteKey } from "@/lib/talent-site/theme-catalog/maison/seed";
import {
  MAISON_DEFAULT_PALETTE_KEY,
  MAISON_PALETTE_ORDER,
} from "@/lib/talent-site/theme-catalog/maison/seed";
import { designSummaryLine } from "@/lib/talent-site/maison-summary-line";
import { isCollectionDesignSlug } from "@/lib/talent-site/theme-catalog/collection/designs";
import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import type { MaisonPreviewContentMode } from "@/lib/talent-site/theme-catalog/maison/preview-hydration";
import {
  parseMaisonCustomPaletteStored,
  type MaisonCustomPaletteStored,
} from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";

export type MaisonSetupScreen = "gallery" | "detail" | "review" | "apps" | "app";
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
  /** When set and `useCustomPalette`, preview/apply use these colors (W64). */
  customPalette: MaisonCustomPaletteStored | null;
  useCustomPalette: boolean;
  /** Design being previewed / applied: `maison` or a collection slug. */
  designSlug: string;
  /** P4: demo shown in Theme detail (gallery-meta demo key); null = featured. */
  demoKey: string | null;
  /** P4: search query the talent came from ("Results for ..." back link). */
  fromQuery: string | null;
  /**
   * P4: palette the talent explicitly picked for a non-Maison design
   * (gallery-meta palette key). null = the demo's own colors. Kept when the
   * demo switches (colors-kept rule).
   */
  designPaletteKey: string | null;
  /** Theme detail tab: the live preview (default) or the market Apps tab. */
  detailTab?: "preview" | "apps";
  /** Wave 4: app library entry id when `screen === "app"`. */
  appId?: string | null;
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
    customPalette: null,
    useCustomPalette: false,
    designSlug: "maison",
    demoKey: null,
    fromQuery: null,
    designPaletteKey: null,
    detailTab: "preview",
    appId: null,
  };
}

const FROM_QUERY_MAX = 80;

/** Trimmed, bounded search query; empty → null. */
export function parseFromQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.trim().slice(0, FROM_QUERY_MAX).trim();
  return q ? q : null;
}

/** Built demo key valid for the design in gallery-meta, else null. Planned keys drop. */
export function parseDemoKey(designSlug: string, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const design = getGalleryDesign(designSlug);
  return design?.demos.some((d) => d.key === raw && d.status === "built") ? raw : null;
}

/** Palette key valid for the design in gallery-meta, else null. */
export function parseDesignPaletteKey(designSlug: string, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const design = getGalleryDesign(designSlug);
  return design?.palettes.some((p) => p.key === raw) ? raw : null;
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
    o.screen === "detail" ||
    o.screen === "review" ||
    o.screen === "apps" ||
    o.screen === "app"
      ? o.screen
      : "gallery";
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
  const customPalette = parseMaisonCustomPaletteStored(o.customPalette);
  const useCustomPalette = o.useCustomPalette === true && customPalette !== null;
  const designSlug =
    typeof o.designSlug === "string" && isCollectionDesignSlug(o.designSlug)
      ? o.designSlug.trim().toLowerCase()
      : "maison";
  const detailTab = o.detailTab === "apps" ? "apps" : "preview";
  const appId =
    typeof o.appId === "string" && o.appId.trim() ? o.appId.trim() : null;
  return {
    screen,
    paletteKey,
    contentMode,
    previewDevice,
    status,
    phoneSheet: null, // sheets never persist across reopen
    customPalette,
    useCustomPalette,
    designSlug,
    demoKey: parseDemoKey(designSlug, o.demoKey),
    fromQuery: parseFromQuery(o.fromQuery),
    designPaletteKey: parseDesignPaletteKey(designSlug, o.designPaletteKey),
    detailTab,
    appId,
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
    window.localStorage.setItem(
      choicesStorageKey(talentProfileId),
      JSON.stringify(persistableMaisonChoices(choices)),
    );
  } catch {
    // quota / private mode — choices stay in-memory for the session
  }
}

/** Strip ephemeral UI (phone sheets) before writing storage / server. */
export function persistableMaisonChoices(
  choices: MaisonSetupChoices,
): Omit<MaisonSetupChoices, "phoneSheet"> & { phoneSheet?: never } {
  const { phoneSheet: _sheet, ...persistable } = choices;
  return persistable;
}

/**
 * Mid-setup resume (cr_resume / W75): detail or review, or an explicit
 * Choices/Draft saved status. Gallery + Preview alone is not resumable.
 */
export function isMaisonSetupResumable(choices: MaisonSetupChoices): boolean {
  if (choices.status === "Live") return false;
  if (
    choices.screen === "detail" ||
    choices.screen === "review" ||
    choices.screen === "apps" ||
    choices.screen === "app"
  ) {
    return true;
  }
  return choices.status === "Choices saved" || choices.status === "Draft saved";
}

/** Today card subtitle: "Maison · Lilac & Plum · Choices saved". */
export function maisonResumeSummaryLine(
  choices: MaisonSetupChoices,
  locale: "en" | "es",
): string {
  const statusLabel =
    locale === "es"
      ? choices.status === "Choices saved"
        ? "Elecciones guardadas"
        : choices.status === "Draft saved"
          ? "Borrador guardado"
          : choices.status === "Live"
            ? "En vivo"
            : "Vista previa"
      : choices.status;
  // F33: the chosen design's own name and palette, not "Maison" for every design.
  return designSummaryLine({
    designSlug: choices.designSlug,
    lookSlug: choices.designPaletteKey,
    paletteKey: choices.paletteKey,
    customPalette: choices.useCustomPalette ? choices.customPalette : null,
    tail: statusLabel,
    locale,
  });
}

/** P4: what the gallery passes when a theme card is explored. */
export type MaisonExploreOptions = {
  demoKey?: string | null;
  fromQuery?: string | null;
  /** Open Theme detail on this tab (app badge click). */
  tab?: "apps";
};

/**
 * Patch for opening Theme detail from the gallery. Backward compatible:
 * `onExplore(slug)` still works. Demo key is validated against gallery-meta;
 * palette picks are per design, so a new design starts on its demo colors
 * (custom colors, when on, stay on).
 */
export function exploreDesignPatch(
  designSlug: string,
  opts?: MaisonExploreOptions,
): Partial<MaisonSetupChoices> {
  const slug = isCollectionDesignSlug(designSlug) ? designSlug.trim().toLowerCase() : "maison";
  return {
    screen: "detail",
    status: "Preview",
    designSlug: slug,
    demoKey: parseDemoKey(slug, opts?.demoKey ?? null),
    fromQuery: parseFromQuery(opts?.fromQuery ?? null),
    designPaletteKey: null,
    phoneSheet: null,
    detailTab: opts?.tab === "apps" ? "apps" : "preview",
  };
}
