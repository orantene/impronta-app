/**
 * The splitter that decides whether a repair repairs anything.
 *
 * These are not hypotheticals. Every shape below is taken from a file in
 * `supabase/migrations` that the isolated branch still needs, and getting any
 * of them wrong turns a replay into a half-applied schema — which is the fault
 * this whole program exists to stop asserting away.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitSqlStatements,
  isTransactionControl,
  forbidsTransaction,
  stripLeadingComments,
} from "./sql-statements.mjs";

test("a plpgsql body is one statement, semicolons and all", () => {
  const sql = `
CREATE OR REPLACE FUNCTION public.orders_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TYPE order_status AS ENUM ('draft', 'paid');
`;
  const statements = splitSqlStatements(sql);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /orders_touch_updated_at/);
  assert.match(statements[0], /RETURN NEW;/, "the body must survive intact");
  assert.match(statements[1], /^CREATE TYPE order_status/);
});

test("a tagged dollar quote closes on its own tag, not on $$", () => {
  const sql = `
CREATE FUNCTION f() RETURNS text LANGUAGE plpgsql AS $body$
DECLARE q text := '$$ not a delimiter $$';
BEGIN RETURN q; END;
$body$;
SELECT 1;
`;
  const statements = splitSqlStatements(sql);
  assert.equal(statements.length, 2);
  assert.equal(statements[1], "SELECT 1");
});

test("$1 is a parameter, never a dollar quote", () => {
  const statements = splitSqlStatements("SELECT $1; SELECT $2;");
  assert.deepEqual(statements, ["SELECT $1", "SELECT $2"]);
});

test("a doubled quote inside a string does not end it", () => {
  const statements = splitSqlStatements(
    "INSERT INTO t (v) VALUES ('it''s; fine'); SELECT 2;",
  );
  assert.equal(statements.length, 2);
  assert.match(statements[0], /it''s; fine/);
});

test("an E-string's backslash escape does not end it", () => {
  const statements = splitSqlStatements("SELECT E'a\\'; b'; SELECT 2;");
  assert.equal(statements.length, 2, "the ; inside the escaped string is not a split");
});

test("a semicolon in a comment or a quoted identifier is not a split", () => {
  const statements = splitSqlStatements(`
-- drop this; and that
CREATE TABLE "weird;name" (id int); -- trailing
/* nested /* block; */ still a comment; */
SELECT 3;
`);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /weird;name/);
  assert.equal(stripLeadingComments(statements[1]), "SELECT 3");
});

test("a trailing statement with no semicolon is still a statement", () => {
  assert.deepEqual(splitSqlStatements("SELECT 1;\nSELECT 2"), ["SELECT 1", "SELECT 2"]);
});

test("a file's own transaction control is recognised, a plpgsql BEGIN is not", () => {
  const wrapped = splitSqlStatements("BEGIN;\nUPDATE t SET x = 1;\nCOMMIT;");
  assert.deepEqual(wrapped.map(isTransactionControl), [true, false, true]);

  const fn = splitSqlStatements(
    "CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$ BEGIN END; $$;",
  );
  assert.deepEqual(
    fn.map(isTransactionControl),
    [false],
    "a body's BEGIN lives inside a dollar quote and is not transaction control",
  );

  assert.equal(
    isTransactionControl(splitSqlStatements("-- start\nBEGIN work;")[0]),
    true,
    "a comment above BEGIN must not hide it",
  );
  assert.equal(
    isTransactionControl("BEGINNING_OF_TIME()"),
    false,
    "a prefix match is not transaction control",
  );
});

test("CONCURRENTLY is flagged, because no transaction can hold it", () => {
  assert.equal(forbidsTransaction("CREATE INDEX CONCURRENTLY i ON t (c)"), true);
  assert.equal(forbidsTransaction("CREATE INDEX i ON t (c)"), false);
  assert.equal(
    forbidsTransaction("-- once created concurrently\nCREATE INDEX i ON t (c)"),
    false,
    "the word in a leading comment is not the statement",
  );
});
