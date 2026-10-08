/**
 * The theme_template adapter bound to the real server actions (CLIENT mount
 * imports this; the actions run across the RSC boundary). Tests import the
 * `-core` with a spy instead.
 */
import type { ThemeDraftTree } from "@/lib/talent-site/theme-template/types";

import {
  createThemeTemplateAdapter as createCore,
  type ThemeTemplateAdapterActions,
} from "./theme-template-adapter-core";
import {
  loadThemeTemplateTreeAction,
  saveThemeTemplateTreeAction,
} from "./theme-template-actions";

const productionActions: ThemeTemplateAdapterActions = {
  loadTree: (input) => loadThemeTemplateTreeAction(input),
  saveTree: (input) => saveThemeTemplateTreeAction(input),
};

export function createBoundThemeTemplateAdapter(design: string, tree: ThemeDraftTree) {
  return createCore(design, tree, productionActions);
}
