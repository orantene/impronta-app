/**
 * Action set for the theme_template surface, built over injectable server
 * actions so it can be tested with a fake store. TALENT-ONLY: never the
 * tenant/agency set. Presets and component styles are unsupported here.
 */
import { adoptDraftRev, resolveExpectedDraftRev } from "@/lib/talent-site/history/draft-rev";
import { THEME_TEMPLATE_UNSUPPORTED } from "@/lib/talent-site/theme-template/theme-template-tokens";
import type {
  ComponentStylesSaveResult,
  DesignLoadResult,
  DesignPresetResult,
  DesignPublishResult,
  DesignSaveResult,
} from "@/lib/site-admin/edit-mode/design-actions";

export interface ThemeTemplateDeps {
  load(input: { design: string; look?: string | null }): Promise<DesignLoadResult>;
  save(input: {
    design: string;
    patch: Record<string, string>;
    expectedRev: number;
    look?: string | null;
  }): Promise<DesignSaveResult>;
  /** The editor's current `?look=` (palette key) so colour edits land on that palette. */
  getLook?: () => string | null;
}

/** `?look=` of the editor URL (client); null on the server or when absent. */
export function editorLookFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("look");
}

const UNSUPPORTED = `${THEME_TEMPLATE_UNSUPPORTED.en} / ${THEME_TEMPLATE_UNSUPPORTED.es}`;

export function createThemeTemplateActionSet(design: string, deps: ThemeTemplateDeps) {
  return {
    load: () => deps.load({ design, look: deps.getLook?.() ?? null }),
    async saveDraft(input: {
      patch: Record<string, string>;
      expectedVersion: number;
    }): Promise<DesignSaveResult> {
      const expected = resolveExpectedDraftRev(input.expectedVersion) ?? input.expectedVersion;
      const res = await deps.save({ design, patch: input.patch, expectedRev: expected, look: deps.getLook?.() ?? null });
      if (res.ok && typeof res.draftRev === "number") adoptDraftRev(expected, res.draftRev);
      return res;
    },
    async saveComponentStyles(_input: {
      componentStyles: unknown;
      expectedVersion: number;
    }): Promise<ComponentStylesSaveResult> {
      return { ok: false, error: UNSUPPORTED, code: "unsupported" };
    },
    async applyPreset(_input: {
      presetSlug: string;
      expectedVersion: number;
    }): Promise<DesignPresetResult> {
      return { ok: false, error: UNSUPPORTED, code: "unsupported" };
    },
    // Publishing a design is "Publish as vN+1" (S-publish), not the drawer's publish.
    async publish(_input: { expectedVersion: number }): Promise<DesignPublishResult> {
      return { ok: false, error: UNSUPPORTED, code: "unsupported" };
    },
  };
}
