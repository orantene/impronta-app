/**
 * TUL-516 C2: Gridline "No emergencies today" status pill is Spanish on es pages.
 * Render-time map shares NO_EMERGENCIES_TODAY_LABEL with the seed overlay table.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { localiseSeededDesignLabels } from "@/lib/talent-site/design-label-locale";
import {
  EMERGENCIES_TODAY_LABEL,
  NO_EMERGENCIES_TODAY_LABEL,
} from "../seed-i18n";

test("TUL-516 C2: legacy English statusOff (no overlay) localises on es pages", () => {
  const legacy = [
    {
      id: "u",
      kind: "utility_bar",
      props: {
        name: "Saul",
        showStatus: true,
        statusOffLabel: NO_EMERGENCIES_TODAY_LABEL.en,
      },
    },
  ] as unknown as BuilderNode[];
  const es = localiseSeededDesignLabels(legacy, "es-MX");
  assert.equal((es[0]!.props as { statusOffLabel: string }).statusOffLabel, NO_EMERGENCIES_TODAY_LABEL.es);
  const en = localiseSeededDesignLabels(legacy, "en");
  assert.equal((en[0]!.props as { statusOffLabel: string }).statusOffLabel, NO_EMERGENCIES_TODAY_LABEL.en);
  assert.equal((en[0]!.props as { statusOnLabel: string }).statusOnLabel, EMERGENCIES_TODAY_LABEL.en);
});

test("TUL-516 C2: missing statusOffLabel (saul-shaped) fills Spanish on es pages", () => {
  const bare = [
    {
      id: "u",
      kind: "utility_bar",
      props: { name: "Saul", showStatus: true },
    },
  ] as unknown as BuilderNode[];
  const es = localiseSeededDesignLabels(bare, "es");
  assert.equal((es[0]!.props as { statusOffLabel: string }).statusOffLabel, NO_EMERGENCIES_TODAY_LABEL.es);
  assert.equal((es[0]!.props as { statusOnLabel: string }).statusOnLabel, EMERGENCIES_TODAY_LABEL.es);
  const en = localiseSeededDesignLabels(bare, "en");
  assert.equal((en[0]!.props as { statusOffLabel: string }).statusOffLabel, NO_EMERGENCIES_TODAY_LABEL.en);
});
