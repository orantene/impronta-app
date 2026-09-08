"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { tablesCloseVisit, tablesMoveVisit, tablesOpenVisit } from "./actions";
import type { FloorTable } from "@/lib/visits/floor";

export function TablesClient(props: {
  tenantSlug: string;
  tables: FloorTable[];
  copy: {
    empty: string;
    open: string;
    close: string;
    sale: string;
    occupied: string;
    free: string;
    minSpend: string;
    move: string;
    openTab: string;
    tab: string;
    table: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setMsg("error" in r && r.error ? r.error : "unavailable");
    else router.refresh();
    return r;
  }

  if (props.tables.length === 0) return <p>{props.copy.empty}</p>;

  return (
    <div>
      {msg ? <p>{msg}</p> : null}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
        {props.tables.map((table) => (
          <li
            key={table.spaceId}
            style={{
              border: "1px solid rgba(24,24,27,0.12)",
              borderRadius: 12,
              padding: 16,
              minHeight: 88,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{table.code ?? table.name}</strong>
                <span style={{ color: "rgba(11,11,13,0.55)", marginLeft: 8 }}>
                  {table.visitId
                    ? `${table.serviceKind === "tab" ? props.copy.tab : props.copy.table} · ${props.copy.occupied}`
                    : props.copy.free}
                </span>
                {table.minSpendCents > 0 ? (
                  <p style={{ margin: "6px 0 0", fontSize: 13 }}>
                    {props.copy.minSpend}: {table.remainingMinSpendCents}
                  </p>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!table.visitId ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      style={{ minHeight: 44 }}
                      onClick={() => void run(() => tablesOpenVisit(table.spaceId, "table"))}
                    >
                      {props.copy.open}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      title={props.copy.openTab}
                      style={{ minHeight: 44 }}
                      onClick={() => void run(() => tablesOpenVisit(table.spaceId, "tab"))}
                    >
                      {props.copy.openTab}
                    </button>
                  </>
                ) : (
                  <>
                    {table.orderId ? (
                      <button
                        type="button"
                        style={{ minHeight: 44 }}
                        onClick={() => router.push(`/${props.tenantSlug}/admin/pos?order=${table.orderId}`)}
                      >
                        {props.copy.sale}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      style={{ minHeight: 44 }}
                      onClick={() =>
                        void run(() =>
                          tablesCloseVisit({
                            visitId: table.visitId!,
                            expectedVersion: table.visitVersion ?? undefined,
                          }),
                        )
                      }
                    >
                      {props.copy.close}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      style={{ minHeight: 44 }}
                      onClick={() => setMoveFor(moveFor === table.visitId ? null : table.visitId)}
                    >
                      {props.copy.move}
                    </button>
                  </>
                )}
              </div>
            </div>
            {moveFor && table.visitId === moveFor ? (
              <p style={{ marginTop: 12 }}>
                {props.tables
                  .filter((t) => !t.visitId && t.spaceId !== table.spaceId)
                  .map((dest) => (
                    <button
                      key={dest.spaceId}
                      type="button"
                      disabled={busy}
                      style={{ minHeight: 44, marginRight: 8 }}
                      onClick={() =>
                        void run(async () => {
                          const r = await tablesMoveVisit({
                            visitId: table.visitId!,
                            spaceId: dest.spaceId,
                            expectedVersion: table.visitVersion ?? undefined,
                          });
                          if (r.ok) setMoveFor(null);
                          return r;
                        })
                      }
                    >
                      {dest.code ?? dest.name}
                    </button>
                  ))}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
