"use client";

/**
 * ChangeServerSheet — T17 `POSChangeServer`: `Change server · T05` /
 * `Pérez · 3 · currently Dani`, one tile per person (initials, name, how
 * many tables they serve tonight, `current`), the facts card (`From now on
 * · Ana serves T05`, tips, drawer), `Back` and `Give T05 to Ana`.
 *
 * WIRED to the engine's `visit_change_server` (`visits.server_user_id`).
 * The people are the workspace's members (`data.servers`); the table count
 * is what the floor read tonight. Tips and the drawer are not affected by
 * a server change, and the card says so.
 */

import { useState } from "react";

import { interpolate } from "@/i18n/interpolate";
import type { FloorTable } from "@/lib/visits/floor";
import { cn } from "@/lib/utils";
import { initialsOf } from "../pos/CustomerSheet";
import { POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "../pos/pos-classes";
import { PosSheet } from "../pos/PosSheet";

import type { FloorBoardCopy } from "./floor-copy";
import { seatedEntryFor, tableCode } from "./floor-model";
import { FACT_ROW } from "./floor-tones";
import type { FloorBoardData } from "./floor-types";

export type ChangeServerSheetProps = {
  readonly open: boolean;
  readonly data: FloorBoardData;
  readonly copy: FloorBoardCopy;
  readonly table: FloorTable;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onChange: (userId: string) => void;
};

export function ChangeServerSheet(props: ChangeServerSheetProps) {
  const { data, copy, table, busy } = props;
  const s = copy.engine.server;
  const [choice, setChoice] = useState<string | null>(null);
  const code = tableCode(table);
  const entry = seatedEntryFor(table, data.book);
  const size = table.partySize ?? entry?.partySize ?? null;
  const party = [entry?.holderName ?? copy.panel.walkIn, size == null ? null : String(size)].filter(Boolean).join(" · ");
  const servers = data.servers ?? [];
  const current = servers.find((p) => p.userId === table.serverUserId) ?? null;
  const chosen = servers.find((p) => p.userId === choice) ?? null;
  const tablesFor = (userId: string) => data.tables.filter((t) => t.state === "occupied" && !t.joinedFromSpaceId && t.serverUserId === userId).length;

  return (
    <PosSheet
      open={props.open}
      name="change-server"
      title={interpolate(s.title, { code })}
      subtitle={interpolate(s.subtitle, { party, name: current?.name ?? s.nobody })}
      closeLabel={copy.popover.close}
      onClose={props.onClose}
      footerStart={
        <button type="button" className={POS_SECONDARY_ACTION} disabled={busy} onClick={props.onClose}>
          {s.back}
        </button>
      }
      footerEnd={
        <button type="button" data-floor-server-confirm className={POS_PRIMARY_ACTION} disabled={busy || !chosen || chosen.userId === table.serverUserId} onClick={() => chosen && props.onChange(chosen.userId)}>
          {interpolate(s.confirm, { code, name: chosen?.name ?? "…" })}
        </button>
      }
    >
      {servers.length === 0 ? (
        <p role="status" data-floor-server-none className="m-0 text-[15px] text-admin-ink-muted">
          {s.none}
        </p>
      ) : (
        <ul role="radiogroup" className="m-0 grid list-none grid-cols-3 gap-3 p-0">
          {servers.map((person) => {
            const active = chosen?.userId === person.userId;
            const isCurrent = person.userId === table.serverUserId;
            return (
              <li key={person.userId}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-floor-server={person.userId}
                  disabled={busy}
                  onClick={() => setChoice(person.userId)}
                  className={cn(
                    "flex min-h-[96px] w-full flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] px-2 py-3 text-center transition-colors",
                    active ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:bg-admin-surface-alt",
                  )}
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-admin-surface-alt text-[12px] font-bold text-admin-ink">{initialsOf(person.name)}</span>
                  <span className="text-[16px] font-semibold text-admin-ink">{person.name}</span>
                  <span className="text-[13px] text-admin-ink-muted">
                    {interpolate(s.tables, { n: tablesFor(person.userId) })}
                    {isCurrent ? ` · ${s.current}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-4 py-1">
        <div className={FACT_ROW}>
          <span className="text-admin-ink-muted">{s.fromNow}</span>
          <strong className="text-right text-admin-ink">{interpolate(s.fromNowValue, { name: chosen?.name ?? "…", code })}</strong>
        </div>
        <div className={FACT_ROW}>
          <span className="text-admin-ink-muted">{s.tips}</span>
          <strong className="text-right text-admin-ink">{s.tipsValue}</strong>
        </div>
        <div className={FACT_ROW}>
          <span className="text-admin-ink-muted">{s.drawer}</span>
          <strong className="text-right text-admin-ink">{s.drawerValue}</strong>
        </div>
      </div>
    </PosSheet>
  );
}
