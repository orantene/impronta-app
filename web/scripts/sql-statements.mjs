/**
 * Split a migration file into its top-level statements.
 *
 * WHY THIS EXISTS. `repair-journeys-isolated.mjs` sent each migration to
 * Postgres as ONE query, and a multi-statement query is implicitly one
 * transaction: the first statement that raises discards every statement after
 * it. On the isolated branch that is the difference between a repair and a
 * no-op, because the files that still fail there fail on a statement whose
 * effect is ALREADY PRESENT. `20261228000142_orders_and_order_lines.sql` stops
 * at `CREATE TYPE order_status` — "type already exists" — and so
 * `orders_touch_updated_at` and `orders_refresh_customer_rollups` were still
 * missing after a replay the script reported as attempted. The rollups those
 * triggers maintain are what a CRM journey reads.
 *
 * So the caller replays statement by statement, skips the ones that are
 * already true, and reports the rest individually. That needs a splitter, and
 * `sql.split(";")` is not one: a plpgsql body is full of semicolons and lives
 * inside `$$`, which is exactly where every function in these files is
 * defined.
 *
 * WHAT IT UNDERSTANDS, because migrations in this repo contain all of it:
 * dollar quoting with and without a tag, `''` inside a string, `E'\''`,
 * double-quoted identifiers, `--` to end of line, and nested block comments
 * (Postgres nests them; SQL-92 does not).
 *
 * WHAT IT IS NOT. Not a parser. It does not know a statement's meaning, and
 * `$1` is deliberately not dollar quoting — a tag must start with a letter or
 * underscore, or be empty.
 */

/**
 * @param {string} sql
 * @returns {string[]} statements with their comments attached, no trailing `;`
 */
export function splitSqlStatements(sql) {
  const statements = [];
  let buf = "";
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];

    if (ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      const end = nl === -1 ? n : nl + 1;
      buf += sql.slice(i, end);
      i = end;
      continue;
    }

    if (ch === "/" && sql[i + 1] === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") {
          depth += 1;
          j += 2;
        } else if (sql[j] === "*" && sql[j + 1] === "/") {
          depth -= 1;
          j += 2;
        } else {
          j += 1;
        }
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }

    if (ch === "'") {
      // `E'…'` honours backslash escapes; a plain string does not, under
      // standard_conforming_strings. Both double `''` to embed a quote.
      const escapes = /[Ee]$/.test(buf);
      let j = i + 1;
      while (j < n) {
        if (escapes && sql[j] === "\\") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }

    if (ch === "$") {
      const tag = /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.exec(sql.slice(i))?.[0];
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length);
        const end = close === -1 ? n : close + tag.length;
        buf += sql.slice(i, end);
        i = end;
        continue;
      }
    }

    if (ch === ";") {
      const stmt = buf.trim();
      if (stmt) statements.push(stmt);
      buf = "";
      i += 1;
      continue;
    }

    buf += ch;
    i += 1;
  }

  const tail = buf.trim();
  if (tail) statements.push(tail);
  return statements;
}

/**
 * Is this statement the file opening or closing its own transaction?
 *
 * Several migrations wrap themselves in `BEGIN … COMMIT`. A statement-level
 * replay must NOT keep those: the replayer opens one transaction of its own
 * around the whole file, so an inner `COMMIT` would end it early and leave the
 * rest of the file outside any transaction — half-applying a file that was
 * written to be all-or-nothing. Dropping them keeps the file's promise, and
 * anything the file meant to abort still aborts, because a genuine failure
 * rolls the replayer's transaction back.
 *
 * `BEGIN` inside a plpgsql body is not this: the splitter keeps bodies whole
 * inside their dollar quotes, so only a top-level `BEGIN` statement is seen.
 *
 * @param {string} statement
 */
export function isTransactionControl(statement) {
  return /^(begin|start\s+transaction|commit|end|rollback)(\s+(work|transaction)\b[\s\S]*)?$/i.test(
    stripLeadingComments(statement),
  );
}

/**
 * Statements Postgres refuses to run inside a transaction block.
 *
 * `CREATE INDEX CONCURRENTLY` is the one that appears here. A file containing
 * it cannot be replayed under a single transaction at all, so the caller drops
 * to statement-at-a-time autocommit for that file and says so — the atomicity
 * was never available, and pretending otherwise would fail every statement
 * after the first with "cannot run inside a transaction block".
 *
 * @param {string} statement
 */
export function forbidsTransaction(statement) {
  return /\bconcurrently\b/i.test(stripLeadingComments(statement));
}

/**
 * @param {string} statement
 * @returns {string} the statement without its leading comments, for matching
 */
export function stripLeadingComments(statement) {
  let rest = statement;
  for (;;) {
    const trimmed = rest.replace(/^\s+/, "");
    if (trimmed.startsWith("--")) {
      const nl = trimmed.indexOf("\n");
      rest = nl === -1 ? "" : trimmed.slice(nl + 1);
      continue;
    }
    if (trimmed.startsWith("/*")) {
      let depth = 1;
      let j = 2;
      while (j < trimmed.length && depth > 0) {
        if (trimmed[j] === "/" && trimmed[j + 1] === "*") {
          depth += 1;
          j += 2;
        } else if (trimmed[j] === "*" && trimmed[j + 1] === "/") {
          depth -= 1;
          j += 2;
        } else {
          j += 1;
        }
      }
      rest = trimmed.slice(j);
      continue;
    }
    return trimmed;
  }
}
