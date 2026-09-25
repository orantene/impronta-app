"use client";

import { useEffect, useMemo, useState } from "react";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";
import { resolveAttentionCta } from "@/lib/talent-agenda/attention-cta";
import type { TalentCalendarEntry } from "../../data-bridge";
import { PageHeader } from "../shared/page-chrome-1";
import { SecondaryButton } from "../../primitives";
import { AgendaRow, NowBox, TALENT_AGENDA_VARS } from "./primitives";
import { agendaItemFromCalendarEntry, rowFromAgendaItem, todayFromAgenda } from "./present";
import {
  AGENDA_ATTENTION_CONFIRM_KEY,
  setAgendaAttentionConfirm,
} from "./attention-confirm";
import { useAgendaCta } from "./use-agenda-cta";
import { useAgendaCopy } from "./use-agenda-copy";

export { AGENDA_ATTENTION_CONFIRM_KEY, setAgendaAttentionConfirm };

/**
 * T4.2 Needs attention — same urgency list as Today (`needsAttention`).
 * An item leaves the list when the live derivation no longer ranks it
 * (after a real server action). Confirmation line: who was told.
 */
export function AgendaAttentionPage({
  items,
  entries,
  now,
  loadError,
  onOpenCalendar,
  onOpenBooking,
  onOpenMessages,
}: {
  items?: TalentAgendaItem[];
  entries?: TalentCalendarEntry[];
  now?: Date;
  loadError?: string | null;
  onOpenCalendar: () => void;
  onOpenBooking?: (id: string) => void;
  onOpenMessages?: () => void;
}) {
  const copy = useAgendaCopy();
  const clock = now ?? new Date();
  const agenda =
    items ??
    (entries ?? []).map(agendaItemFromCalendarEntry);
  const { attention } = todayFromAgenda(agenda, clock);
  const [confirm, setConfirm] = useState<string | null>(null);
  const nav = useMemo(
    () => ({ onOpenBooking, onOpenMessages }),
    [onOpenBooking, onOpenMessages],
  );
  const { runCta, busyId, error, setError } = useAgendaCta(nav);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(AGENDA_ATTENTION_CONFIRM_KEY);
      if (raw) {
        setConfirm(raw);
        sessionStorage.removeItem(AGENDA_ATTENTION_CONFIRM_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div style={TALENT_AGENDA_VARS} className="space-y-4">
      <PageHeader
        eyebrow={copy.t("Talent agenda")}
        title={copy.t("Needs attention")}
        subtitle={
          loadError
            ? copy.t("Agenda could not load")
            : attention.length > 0
              ? `${attention.length} ${copy.t("items")} · ${copy.t("most urgent first")}`
              : copy.t("Requests, holds, and payment follow-ups")
        }
        actions={(
          <SecondaryButton onClick={onOpenCalendar}>{copy.t("Open calendar")}</SecondaryButton>
        )}
      />

      {loadError ? (
        <NowBox
          tone="danger"
          title={copy.t("Could not load your agenda")}
          body={loadError}
          primaryAction={{
            label: copy.t("Refresh"),
            onClick: () => {
              if (typeof window !== "undefined") window.location.reload();
            },
          }}
        />
      ) : null}

      {confirm && !loadError ? (
        <NowBox
          tone="success"
          title={confirm}
          body={copy.t("This item left Needs attention after the action succeeded.")}
        />
      ) : null}

      {error ? (
        <NowBox
          tone="danger"
          title={error}
          body={copy.t("Nothing else changed.")}
          primaryAction={{ label: copy.t("Dismiss"), onClick: () => setError(null) }}
        />
      ) : null}

      {!loadError && attention.length > 0 ? (
        <div className="space-y-3">
          {attention.map((item) => {
            const cta = resolveAttentionCta(item);
            const busy = busyId === item.id;
            const row = rowFromAgendaItem(
              item,
              clock,
              onOpenBooking ? () => onOpenBooking(item.id) : undefined,
            );
            return (
              <AgendaRow
                key={item.id}
                item={{
                  ...row,
                  action: {
                    label: busy ? copy.t("Working…") : copy.t(cta.label),
                    onClick: () => {
                      if (busy) return;
                      void runCta(item, cta);
                    },
                  },
                }}
              />
            );
          })}
        </div>
      ) : null}

      {!loadError && attention.length === 0 ? (
        <NowBox
          tone="info"
          title={copy.t("Nothing needs attention right now")}
          body={copy.t("When a request arrives or a hold needs action, it will appear here in urgency order.")}
          primaryAction={{ label: copy.t("Back to calendar"), onClick: onOpenCalendar }}
        />
      ) : null}
    </div>
  );
}
