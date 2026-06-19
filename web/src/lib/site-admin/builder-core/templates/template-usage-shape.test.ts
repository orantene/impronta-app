/**
 * Unit tests for template-usage-shape.ts (Builder Lab D7 — template adoption tally).
 * Pure helpers — no DB, no network.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateTemplateUsage,
  formatTemplateAdoption,
  type BuilderTemplateUsageRow,
} from "./template-usage-shape";

describe("aggregateTemplateUsage", () => {
  it("counts applications per template and distinct tenants", () => {
    const rows: BuilderTemplateUsageRow[] = [
      { template_id: "t1", tenant_id: "a" },
      { template_id: "t1", tenant_id: "a" }, // same tenant → 2 applies, 1 tenant
      { template_id: "t1", tenant_id: "b" },
      { template_id: "t2", tenant_id: "c" },
    ];
    const totals = aggregateTemplateUsage(rows);

    assert.deepEqual(totals.get("t1"), { appliedCount: 3, tenantCount: 2 });
    assert.deepEqual(totals.get("t2"), { appliedCount: 1, tenantCount: 1 });
  });

  it("counts a null-tenant apply toward appliedCount but not tenantCount", () => {
    const rows: BuilderTemplateUsageRow[] = [
      { template_id: "t1", tenant_id: null },
      { template_id: "t1", tenant_id: "a" },
      { template_id: "t1", tenant_id: null },
    ];
    const totals = aggregateTemplateUsage(rows);
    assert.deepEqual(totals.get("t1"), { appliedCount: 3, tenantCount: 1 });
  });

  it("returns an empty map for no rows", () => {
    assert.equal(aggregateTemplateUsage([]).size, 0);
  });

  it("ignores rows with a missing template_id", () => {
    const rows = [
      { template_id: "", tenant_id: "a" },
    ] as unknown as BuilderTemplateUsageRow[];
    assert.equal(aggregateTemplateUsage(rows).size, 0);
  });
});

describe("formatTemplateAdoption", () => {
  it("returns null when never applied", () => {
    assert.equal(formatTemplateAdoption(undefined), null);
    assert.equal(formatTemplateAdoption({ appliedCount: 0, tenantCount: 0 }), null);
  });

  it("pluralizes times and tenants correctly", () => {
    assert.equal(
      formatTemplateAdoption({ appliedCount: 1, tenantCount: 1 }),
      "Applied 1 time across 1 tenant",
    );
    assert.equal(
      formatTemplateAdoption({ appliedCount: 5, tenantCount: 3 }),
      "Applied 5 times across 3 tenants",
    );
  });
});
