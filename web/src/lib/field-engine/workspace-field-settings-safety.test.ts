import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeWorkspaceFieldCatalogOverride } from "@/lib/field-engine/workspace-field-settings-safety";

test("workspace field catalog safety keeps required override when field stays enabled", () => {
  assert.deepEqual(
    sanitizeWorkspaceFieldCatalogOverride({ enabled: true, required: true }),
    { enabled: true, required: true },
  );
});

test("workspace field catalog safety clears required override when field is disabled in the same write", () => {
  assert.deepEqual(
    sanitizeWorkspaceFieldCatalogOverride({ enabled: false, required: true }),
    { enabled: false, required: false },
  );
});

test("workspace field catalog safety preserves omitted keys", () => {
  assert.deepEqual(
    sanitizeWorkspaceFieldCatalogOverride({ required: true }),
    { required: true },
  );
});
