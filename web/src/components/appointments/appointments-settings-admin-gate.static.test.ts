import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TUL-1708: `updateTenantAppointmentsSettings` requires `manage_agency_settings`
 * (admin+) on the server — a deliberate PM decision, left unchanged. But the card
 * that calls it rendered fully interactive for every staff role, so a manager or
 * editor could flip a switch, watch it save optimistically, then get silently
 * reverted by the server refusal with no explanation. `canEdit` must disable
 * every writable control and explain why, and the workspace page must pass it
 * from the admin check, not leave it defaulted to true.
 */

const cardSrc = readFileSync(
  join(process.cwd(), "src/components/appointments/AppointmentsSettingsCard.tsx"),
  "utf8",
);

test("AppointmentsSettingsCard: every writable control gates on canEdit", () => {
  assert.match(cardSrc, /canEdit\s*\??:\s*boolean/, "canEdit must be a documented prop");

  // Every control that disables on `saving` (the card's own writable inputs) must
  // also factor in canEdit. The generic <Switch disabled={disabled}> passthrough
  // is exempt — its caller is one of these `saving`-gated expressions.
  const disabledLines = [...cardSrc.matchAll(/disabled=\{([^}]*saving[^}]*)\}/g)].map((m) => m[1]);
  assert.ok(disabledLines.length >= 6, "expected at least 6 disableable controls");
  for (const expr of disabledLines) {
    assert.match(expr, /canEdit/, `disabled expression "${expr}" must factor in canEdit`);
  }

  assert.match(
    cardSrc,
    /!canEdit[\s\S]{0,200}t\(`\$\{K\}\.adminOnlyNote`\)/,
    "a non-editing viewer must see why the controls are inert",
  );
});

test("WorkspacePageView passes the admin check into AppointmentsSettingsCard, not a bare default", () => {
  const pageSrc = readFileSync(
    join(
      process.cwd(),
      "src/components/admin/shell/internal/page-modules/WorkspacePageView.tsx",
    ),
    "utf8",
  );
  assert.match(
    pageSrc,
    /<AppointmentsSettingsCard tenantSlug=\{tenantSlug\} canEdit=\{isAdmin\} \/>/,
    "AppointmentsSettingsCard must receive canEdit={isAdmin}",
  );
});
