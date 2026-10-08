import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

type Node = Record<string, unknown> & { parent?: Node };
type Rule = {
  create(ctx: { report(r: { messageId: string }): void }): {
    CallExpression(n: Node): void;
  };
};

async function loadRule(): Promise<Rule> {
  const url = pathToFileURL(path.join(process.cwd(), "eslint.config.mjs")).href;
  const mod = (await import(url)) as { default: Array<{ plugins?: Record<string, { rules: Record<string, Rule> }> }> };
  for (const c of mod.default) {
    const r = c.plugins?.ratchet?.rules["no-untenanted-from"];
    if (r) return r;
  }
  throw new Error("rule not found");
}

const lit = (value: string): Node => ({ type: "Literal", value });
const id = (name: string): Node => ({ type: "Identifier", name });
const member = (o: Node, p: string): Node => ({
  type: "MemberExpression",
  computed: false,
  object: o,
  property: id(p),
});

/** Builds db.from(table).select("x").eq(...args) with parent links; returns the from() call. */
function chain(table: string, eqArgs: Node[] | null): Node {
  const from: Node = {
    type: "CallExpression",
    callee: member(id("db"), "from"),
    arguments: [lit(table)],
  };
  let cur = from;
  const link = (name: string, args: Node[]) => {
    const m = member(cur, name);
    cur.parent = m;
    const call: Node = { type: "CallExpression", callee: m, arguments: args };
    m.parent = call;
    cur = call;
  };
  link("select", [lit("x")]);
  if (eqArgs) link("eq", eqArgs);
  return from;
}

async function reports(node: Node): Promise<number> {
  const rule = await loadRule();
  let n = 0;
  rule.create({ report: () => void n++ }).CallExpression(node);
  return n;
}

test("agencies keyed by own id = tenantId is exempt", async () => {
  assert.equal(await reports(chain("agencies", [lit("id"), id("tenantId")])), 0);
  assert.equal(await reports(chain("agencies", [lit("id"), member(id("auth"), "tenant_id")])), 0);
});

test("everything else stays reported", async () => {
  assert.equal(await reports(chain("agencies", [lit("id"), id("otherId")])), 1);
  assert.equal(await reports(chain("agencies", [lit("slug"), id("tenantId")])), 1);
  assert.equal(await reports(chain("agencies", null)), 1);
  assert.equal(await reports(chain("talent_profiles", [lit("id"), id("tenantId")])), 1);
});
