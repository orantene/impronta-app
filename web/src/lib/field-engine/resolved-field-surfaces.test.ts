import test from "node:test";
import assert from "node:assert/strict";

import {
  isResolvedFieldVisibleAtRegistration,
  isResolvedFieldVisibleInAdminEditor,
  isResolvedFieldVisibleInDirectory,
  isResolvedFieldVisibleInTalentEditor,
  isResolvedFieldVisibleOnPublicProfile,
} from "@/lib/field-engine/resolved-field-surfaces";

type SurfaceField = Parameters<typeof isResolvedFieldVisibleInAdminEditor>[0];

function field(overrides: Partial<SurfaceField> = {}): SurfaceField {
  return {
    default_visibility: ["public", "agency"],
    is_admin_only: false,
    show_in_registration: true,
    show_in_edit_drawer: true,
    show_in_public: true,
    show_in_directory: true,
    talent_editable: true,
    ...overrides,
  };
}

test("resolved surfaces: admin editor obeys edit-drawer flag only", () => {
  assert.equal(isResolvedFieldVisibleInAdminEditor(field()), true);
  assert.equal(
    isResolvedFieldVisibleInAdminEditor(field({ show_in_edit_drawer: false })),
    false,
  );
});

test("resolved surfaces: talent and registration require talent-editable non-admin fields", () => {
  assert.equal(isResolvedFieldVisibleInTalentEditor(field()), true);
  assert.equal(isResolvedFieldVisibleAtRegistration(field()), true);
  assert.equal(
    isResolvedFieldVisibleInTalentEditor(field({ talent_editable: false })),
    false,
  );
  assert.equal(
    isResolvedFieldVisibleAtRegistration(field({ is_admin_only: true })),
    false,
  );
});

test("resolved surfaces: public and directory require public-safe visibility", () => {
  assert.equal(isResolvedFieldVisibleOnPublicProfile(field()), true);
  assert.equal(isResolvedFieldVisibleInDirectory(field()), true);
  assert.equal(
    isResolvedFieldVisibleOnPublicProfile(field({ show_in_public: false })),
    false,
  );
  assert.equal(
    isResolvedFieldVisibleInDirectory(field({ show_in_directory: false })),
    false,
  );
  assert.equal(
    isResolvedFieldVisibleInDirectory(field({ default_visibility: ["agency"] })),
    false,
  );
});
