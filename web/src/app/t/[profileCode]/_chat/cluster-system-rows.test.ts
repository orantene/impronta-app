import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clusterSystemRows,
  clusterDefaultCollapsed,
  clusterCaption,
  type ClusterableRow,
} from "./cluster-system-rows";

const sys = (id: string, body: string, isDeleted = false): ClusterableRow => ({ id, authorRole: "system", body, isDeleted });
const msg = (id: string, body: string): ClusterableRow => ({ id, authorRole: "guest", body });

test("the owner's screenshot burst folds into ONE cluster", () => {
  const rows = [
    sys("1", "Added 9 talent to your inquiry."),
    sys("2", "Added 9 talent to your inquiry."),
    sys("3", "Added 9 talent to your inquiry."),
    sys("4", "Added 9 talent to your inquiry."),
    sys("5", "Lineup · 1 talent"),
    sys("6", "The agency updated the talent on your inquiry."),
  ];
  const nodes = clusterSystemRows(rows);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0]!.kind, "system-cluster");
  if (nodes[0]!.kind === "system-cluster") {
    assert.equal(nodes[0]!.rows.length, 6);
    assert.equal(nodes[0]!.id, "1");
  }
});

test("human messages split clusters and keep timeline position", () => {
  const rows = [
    sys("a", "Location set to Tulum."),
    sys("b", "Budget: USD 350."),
    msg("c", "Hi, is she available?"),
    sys("d", "The agency replied."),
  ];
  const nodes = clusterSystemRows(rows);
  assert.deepEqual(nodes.map((n) => n.kind), ["system-cluster", "message", "system-cluster"]);
});

test("deleted system notes are dropped; a fully-deleted run emits nothing", () => {
  const rows = [sys("x", "old", true), sys("y", "kept"), sys("z", "gone", true)];
  const nodes = clusterSystemRows(rows);
  assert.equal(nodes.length, 1);
  if (nodes[0]!.kind === "system-cluster") assert.deepEqual(nodes[0]!.rows.map((r) => r.id), ["y"]);

  assert.equal(clusterSystemRows([sys("only", "gone", true)]).length, 0);
});

test("clusterDefaultCollapsed: expand short runs, collapse bursts", () => {
  assert.equal(clusterDefaultCollapsed(1), false);
  assert.equal(clusterDefaultCollapsed(2), false);
  assert.equal(clusterDefaultCollapsed(3), true);
  assert.equal(clusterDefaultCollapsed(6), true);
});

test("clusterCaption summarizes with the newest note + hidden count", () => {
  const c = clusterCaption([sys("1", "Location set to Tulum."), sys("2", "Budget: USD 6,000.")]);
  assert.equal(c.latest, "Budget: USD 6,000.");
  assert.equal(c.hiddenCount, 1);
  assert.deepEqual(clusterCaption([]), { latest: "", hiddenCount: 0 });
});
