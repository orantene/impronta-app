#!/usr/bin/env tsx
/**
 * Release recorder (TUL-1389): record a production release in Notion.
 *
 * Run it after `promote-production.yml` advances the `production` pointer:
 *
 *   cd web && npm run release:record                # record origin/production
 *   cd web && npm run release:record -- --dry-run   # print, write nothing
 *   cd web && npm run release:record -- --tag       # also push git tag release/<id>
 *   cd web && npm run release:record -- --from <sha>  # first run: where to start
 *
 * What it does:
 *   1. Reads the last "Production release" row in the Notion Releases database
 *      and stops if origin/production is already recorded (safe to re-run).
 *   2. Lists first-parent commits from the last recorded commit to the new one
 *      and pulls every PR number out of their messages.
 *   3. Matches those PRs to Tickets & Tasks rows through the ticket PR field.
 *   4. Creates the Releases row (Draft, tier 0, commit, PR list, commit list)
 *      and links each matched ticket to it from the ticket side (the API caps
 *      a relation write at 100 items, a release can carry hundreds).
 *
 * Env (from web/.env.local): NOTION_API_KEY. The integration must be connected
 * to the Releases and Tickets & Tasks databases in Notion. Optional overrides:
 * NOTION_RELEASES_DATABASE_ID, NOTION_TICKETS_DATABASE_ID. Never printed.
 *
 * Not a GitHub workflow on purpose: the promote job's token cannot be given
 * Notion access without a workflow change, and the PM runs releases by hand.
 */
import { execFileSync } from "node:child_process";

import {
  NOTION_ARRAY_MAX,
  buildReleaseBodyBlocks,
  buildReleaseProperties,
  chunk,
  extractPrNumbers,
  matchTicketsToPrs,
  nextReleaseId,
  prefixToIsoDate,
  releaseDatePrefix,
  withRelease,
  type CommitLine,
  type TicketPrRow,
} from "../src/lib/releases/release-recorder";

const NOTION_VERSION = "2022-06-28";
const NOTION_API = "https://api.notion.com/v1";
const DEFAULT_RELEASES_DB = "09c12dee16a444b9a8ec2298c8272deb";
const DEFAULT_TICKETS_DB = "2da500b7196f4099921502e0784c43f1";

type Args = { dryRun: boolean; tag: boolean; from?: string; to: string; date?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, tag: false, to: "origin/production" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--tag") args.tag = true;
    else if (a === "--from") args.from = argv[++i];
    else if (a === "--to") args.to = argv[++i];
    else if (a === "--date") args.date = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function git(...gitArgs: string[]): string {
  return execFileSync("git", gitArgs, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

function isAncestor(from: string, to: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", from, to]);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function notion<T>(apiKey: string, method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${NOTION_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get("retry-after") ?? "1");
      await sleep((Number.isFinite(wait) ? wait : 1) * 1000);
      continue;
    }
    const json = (await res.json()) as T & { message?: string };
    if (!res.ok) throw new Error(`Notion ${method} ${path} failed (${res.status}): ${json.message ?? ""}`);
    // Stay under Notion's ~3 requests/second average.
    await sleep(350);
    return json;
  }
  throw new Error(`Notion ${method} ${path} kept failing (rate limited or 5xx)`);
}

type NotionPage = { id: string; properties: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function queryAll(apiKey: string, databaseId: string, body: Record<string, unknown>): Promise<NotionPage[]> {
  const out: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const page = await notion<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
      apiKey,
      "POST",
      `/databases/${databaseId}/query`,
      { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
    );
    out.push(...page.results);
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

const plain = (prop: { rich_text?: Array<{ plain_text?: string }> } | undefined) =>
  (prop?.rich_text ?? []).map((t) => t.plain_text ?? "").join("");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.NOTION_API_KEY?.trim();
  if (!apiKey) throw new Error("NOTION_API_KEY is not set (web/.env.local).");
  const releasesDb = process.env.NOTION_RELEASES_DATABASE_ID?.trim() || DEFAULT_RELEASES_DB;
  const ticketsDb = process.env.NOTION_TICKETS_DATABASE_ID?.trim() || DEFAULT_TICKETS_DB;

  git("fetch", "--quiet", "origin", "production", "main");
  const to = git("rev-parse", args.to);

  const recorded = await queryAll(apiKey, releasesDb, {
    filter: { property: "Kind", select: { equals: "Production release" } },
    sorts: [{ property: "Release date", direction: "descending" }, { timestamp: "created_time", direction: "descending" }],
  });
  const recordedCommits = recorded.map((p) => plain(p.properties.Commit));
  if (recordedCommits.some((c) => c && (to.startsWith(c) || c.startsWith(to)))) {
    console.log(`Already recorded: ${to.slice(0, 10)} has a Releases row. Nothing to do.`);
    return;
  }

  const from = args.from ? git("rev-parse", args.from) : recordedCommits.find(Boolean);
  if (!from) throw new Error("No production release recorded yet. First run: pass --from <previous production sha>.");
  if (!isAncestor(from, to)) throw new Error(`${from.slice(0, 10)} is not an ancestor of ${to.slice(0, 10)}.`);

  const raw = git("log", "--first-parent", "--format=%H%x1f%s%x1f%b%x1e", `${from}..${to}`);
  const entries = raw
    .split("\x1e")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => {
      const [sha, subject, bodyText] = e.split("\x1f");
      return { sha, subject, body: bodyText ?? "" };
    });
  const commits: CommitLine[] = entries.map(({ sha, subject }) => ({ sha, subject }));
  const prNumbers = extractPrNumbers(entries.map((e) => `${e.subject}\n${e.body}`));

  const ticketPages = await queryAll(apiKey, ticketsDb, {
    filter: { property: "PR", url: { is_not_empty: true } },
  });
  const tickets: TicketPrRow[] = ticketPages.map((p) => ({
    id: p.id,
    prField: p.properties.PR?.url ?? null,
    releaseIds: (p.properties.Release?.relation ?? []).map((r: { id: string }) => r.id),
  }));
  const matched = matchTicketsToPrs(tickets, prNumbers);

  const prefix = releaseDatePrefix(args.date ? new Date(`${args.date}T12:00:00-05:00`) : new Date());
  const releaseId = nextReleaseId(
    prefix,
    recorded.map((p) => plain(p.properties["Release ID"])),
  );

  console.log(
    `Release ${releaseId}: ${from.slice(0, 10)}..${to.slice(0, 10)}, ${commits.length} commits, ${prNumbers.length} PRs, ${matched.length} tickets.`,
  );
  if (args.dryRun) {
    console.log("Dry run: nothing written.");
    return;
  }

  const blocks = buildReleaseBodyBlocks(commits, matched.length);
  const [firstBlocks, ...restBlocks] = chunk(blocks, NOTION_ARRAY_MAX);
  const created = await notion<{ id: string; url: string }>(apiKey, "POST", "/pages", {
    parent: { database_id: releasesDb },
    properties: buildReleaseProperties({ releaseId, isoDate: prefixToIsoDate(prefix), commit: to, prNumbers }),
    children: firstBlocks ?? [],
  });
  for (const part of restBlocks) {
    await notion(apiKey, "PATCH", `/blocks/${created.id}/children`, { children: part });
  }

  let linked = 0;
  for (const t of matched) {
    await notion(apiKey, "PATCH", `/pages/${t.id}`, {
      properties: { Release: { relation: withRelease(t.releaseIds, created.id).map((id) => ({ id })) } },
    });
    linked++;
  }

  if (args.tag) {
    git("tag", `release/${releaseId}`, to);
    git("push", "origin", `refs/tags/release/${releaseId}`);
  }

  console.log(`Recorded ${created.url} (${linked} tickets linked${args.tag ? `, tag release/${releaseId} pushed` : ""}).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
