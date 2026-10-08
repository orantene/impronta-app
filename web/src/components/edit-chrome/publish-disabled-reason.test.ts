import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { editorT } from "./editor-i18n";
import {
  formatPublishDisabledReason,
  resolvePublishDisabledReason,
  resolvePublishHardBlockReasons,
} from "./publish-disabled-reason";

const HERE = dirname(fileURLToPath(import.meta.url));

const idle = {
  publishing: false,
  hasConflictRecovery: false,
  saving: false,
  dirty: false,
  preflightLoading: false,
  preflightBlockingErrors: 0,
  preflightMobileOverflowErrors: 0,
  missingSectionCount: 0,
  compositionCasVersionMissing: false,
} as const;

test("first-matching publish-disabled reasons stay stable in English", () => {
  assert.equal(
    formatPublishDisabledReason(
      resolvePublishDisabledReason({ ...idle, publishing: true })!,
      (k) => editorT(k, "en"),
    ),
    "Publishing. Please wait.",
  );
  assert.equal(
    formatPublishDisabledReason(
      resolvePublishDisabledReason({ ...idle, dirty: true })!,
      (k) => editorT(k, "en"),
    ),
    "Unsaved changes. Autosave is catching up; try again in a moment.",
  );
  assert.equal(
    formatPublishDisabledReason(
      resolvePublishDisabledReason({
        ...idle,
        preflightBlockingErrors: 2,
        preflightMobileOverflowErrors: 2,
      })!,
      (k) => editorT(k, "en"),
    ),
    "Fix 2 mobile overflow issues to publish.",
  );
  assert.equal(
    formatPublishDisabledReason(
      resolvePublishDisabledReason({
        ...idle,
        preflightBlockingErrors: 1,
        preflightMobileOverflowErrors: 0,
      })!,
      (k) => editorT(k, "en"),
    ),
    "Fix 1 blocking publish check above before publishing.",
  );
});

test("publish-disabled reasons resolve to Spanish via editor i18n", () => {
  const t = (k: string) => editorT(k, "es");
  assert.equal(
    formatPublishDisabledReason(
      resolvePublishDisabledReason({ ...idle, publishing: true })!,
      t,
    ),
    "Publicando. Espera un momento.",
  );
  assert.equal(
    formatPublishDisabledReason(
      resolvePublishDisabledReason({ ...idle, saving: true })!,
      t,
    ),
    "Guardando el borrador. Inténtalo de nuevo en un momento.",
  );
  assert.equal(
    formatPublishDisabledReason(
      resolvePublishDisabledReason({ ...idle, preflightLoading: true })!,
      t,
    ),
    "Ejecutando verificaciones de publicación...",
  );
  assert.equal(
    formatPublishDisabledReason(
      resolvePublishDisabledReason({
        ...idle,
        preflightBlockingErrors: 3,
        preflightMobileOverflowErrors: 0,
      })!,
      t,
    ),
    "Corrige 3 verificaciones de publicación bloqueantes arriba antes de publicar.",
  );
  assert.equal(
    formatPublishDisabledReason(
      resolvePublishDisabledReason({
        ...idle,
        missingSectionCount: 1,
      })!,
      t,
    ),
    "Falta 1 sección de la última versión publicada. Recarga la composición para recuperarla.",
  );
  assert.ok(
    !formatPublishDisabledReason(
      resolvePublishDisabledReason({
        ...idle,
        hasConflictRecovery: true,
      })!,
      t,
    ).includes("—"),
  );
});

test("hard-block overflow reasons use count templates in both locales", () => {
  const reasons = resolvePublishHardBlockReasons({
    hasConflictRecovery: false,
    preflightBlockingErrors: 2,
    preflightMobileOverflowErrors: 2,
    compositionCasVersionMissing: false,
  });
  assert.equal(reasons.length, 1);
  assert.equal(
    formatPublishDisabledReason(reasons[0]!, (k) => editorT(k, "en")),
    '2 blocks overflow the mobile viewport horizontally. A page that scrolls sideways on phones cannot be published. Use "Show on canvas" above to fix each one, then publish.',
  );
  const es = formatPublishDisabledReason(reasons[0]!, (k) => editorT(k, "es"));
  assert.match(es, /^2 bloques se desbordan/);
  assert.ok(es.includes("Mostrar en el lienzo"));
  assert.ok(!es.includes("—"));
});

test("publish drawer routes disabled reasons through the shared helper", () => {
  const src = readFileSync(join(HERE, "publish-drawer.tsx"), "utf8");
  assert.ok(src.includes("resolvePublishDisabledReason"));
  assert.ok(src.includes("formatPublishDisabledReason"));
  assert.ok(!src.includes('return "Publishing. Please wait."'));
});
