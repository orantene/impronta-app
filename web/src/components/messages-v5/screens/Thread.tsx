"use client";

/**
 * Thread (boards D01, D04, D10, D16, D22, M02, M07): the kit ThreadHeader,
 * the stream (day separators, unread divider, grouped bubbles, system lines,
 * cards), the NextStep bar/block and the composer slot. Presentational over
 * the engine types; the shell owns loading, actions and sheets and passes
 * them in. Auto-scrolls to the unread divider on open, else to the bottom.
 */

import { useEffect, useMemo, useRef, type ReactNode } from "react";

import type { DerivedTask, Essentials, InboxRow, InquiryMessagingState, MessagingRefusal, RecordChip, ThreadMessage } from "@/lib/messaging/types";

import { EssentialsStrip } from "../kit/EssentialsStrip";
import { DaySeparator, MessageBubble, SystemLine, UnreadDivider } from "../kit/MessageBubble";
import { Btn, Icon } from "../kit/primitives";
import { RefusalLine } from "../kit/RefusalLine";
import { EmptyState } from "../kit/Skeleton";
import { ThreadHeader } from "../kit/ThreadHeader";
import { ComposerWire, type ComposerWireProps } from "./ComposerWire";
import type { ScreenVariant, ShellActionId } from "./contracts";
import type { ScreenCopy } from "./copy";
import { NextStepWire } from "./NextStep";
import { ThreadCard } from "./ThreadCards";
import { buildStream, dayLabel, deliveryStateFor, formatTime, scrollTargetKey } from "./thread-stream";

export type ThreadMenuItem = { readonly id: ShellActionId; readonly label: string; readonly icon: "note" | "hand" | "link" | "clock" | "ban" };

export type ThreadProps = {
  readonly row: InboxRow;
  readonly essentials: Essentials | null;
  /** Null while loading. */
  readonly messages: readonly ThreadMessage[] | null;
  readonly error: MessagingRefusal | null;
  readonly state: InquiryMessagingState;
  readonly chips: readonly RecordChip[];
  readonly tasks: readonly DerivedTask[];
  readonly currentUserId: string | null;
  readonly copy: ScreenCopy;
  readonly variant: ScreenVariant;
  readonly locale?: string;
  readonly now?: Date;
  readonly origin?: string;
  readonly headerBusy?: boolean;
  readonly nextBusy?: boolean;
  readonly onBack?: () => void;
  readonly onAction: (id: ShellActionId, detail?: { readonly recordId?: string; readonly recordKind?: string }) => void;
  readonly onCopyText: (text: string) => void;
  readonly onRetryLoad: () => void;
  readonly onMoreTasks: () => void;
  readonly menuOpen: boolean;
  readonly onMenu: (open: boolean) => void;
  readonly menuItems: readonly ThreadMenuItem[];
  /** Two columns: the Details button under the header; mobile: the EssentialsStrip's Details door. */
  readonly detailsAction?: { readonly label: string; readonly onClick: () => void } | null;
  /** A refusal or an ok line the shell wants shown at the top of the stream (header actions). */
  readonly notice?: ReactNode;
  /** L4's RenameInline slot, drawn under the header when renaming. */
  readonly renameSlot?: ReactNode;
  /** The identity capture card, drawn at the end of the stream when active (D04, M07). */
  readonly captureSlot?: ReactNode;
  /** L4's "Same person?" MergeCard, drawn at the end of the stream when the shell found a likely duplicate (D14). */
  readonly mergeSlot?: ReactNode;
  /** The composer's engine binding; the Thread mounts the NextStep bar above it on desktop. */
  readonly composer: Omit<ComposerWireProps, "above" | "variant" | "copy">;
};

export function Thread(props: ThreadProps) {
  const { row, essentials, messages, error, state, chips, tasks, currentUserId, copy, variant, locale = "en", now = new Date(), origin, headerBusy, nextBusy, onBack, onAction, onCopyText, onRetryLoad, onMoreTasks, menuOpen, onMenu, menuItems, detailsAction, notice, renameSlot, captureSlot, mergeSlot, composer } = props;
  const kit = copy.kit;
  const shell = copy.shell;
  const mobile = variant === "mobile";
  const streamRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => buildStream({ messages: messages ?? [], currentUserId, unreadCount: row.unreadCount }), [messages, currentUserId, row.unreadCount]);
  const target = useMemo(() => scrollTargetKey(items), [items]);

  useEffect(() => {
    const host = streamRef.current;
    if (!host || !target) return;
    const el = host.querySelector<HTMLElement>(`[data-stream-key="${CSS.escape(target)}"]`);
    if (el) el.scrollIntoView({ block: target.startsWith("unread:") ? "center" : "end" });
    else host.scrollTop = host.scrollHeight;
  }, [target, row.id]);

  const clientName = essentials?.customer.name.trim() || row.contactName.trim() || kit.inbox.visitor;
  const headerEssentials = essentials ?? { name: row.subject || row.contactName, customer: { name: row.contactName, email: row.contactEmail, phone: row.contactPhone, identityLevel: "none" as const, identityMethod: null, request: null, source: null } };
  const owner = row.ownerLabel ? { label: row.ownerLabel, isMe: !!currentUserId && row.ownerUserId === currentUserId } : null;

  const header = (
    <ThreadHeader
      essentials={headerEssentials}
      state={state}
      chips={chips}
      channel={row.channel}
      subject={essentials?.customer.request ?? row.subject}
      when={mobile ? null : formatTime(row.lastCustomerMessageAt ?? row.updatedAt, locale)}
      owner={owner}
      copy={kit}
      variant={variant}
      busy={headerBusy}
      onBack={onBack}
      onAssign={() => onAction("assign")}
      onResolve={() => onAction("resolve")}
      onReopen={() => onAction("reopen")}
      onMore={() => onMenu(!menuOpen)}
    />
  );

  const menu = menuOpen ? (
    <>
      <button type="button" className="scrim" aria-label={kit.sheet.close} onClick={() => onMenu(false)} />
      <div className="tray menu-more" role="menu" data-thread-menu>
        <div className="list">
          {menuItems.map((it) => (
            <button key={it.id} type="button" role="menuitem" className="ti" data-menu-item={it.id} onClick={() => { onMenu(false); onAction(it.id); }}>
              <span className="ic">
                <Icon name={it.icon} size={15} />
              </span>
              <span className="tx">
                <b>{it.label}</b>
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  ) : null;

  const stream = (
    <div ref={streamRef} className={mobile ? "mx-st" : "stream"} data-thread-stream role="log" aria-busy={messages === null || undefined}>
      {notice}
      {error ? <RefusalLine code={error} copy={kit} variant={variant} action={{ label: shell.tryAgain, onClick: onRetryLoad }} /> : null}
      {messages === null && !error ? (
        <div className="thread-loading" role="status" aria-label={shell.loadingThread}>
          <span className="sk w40" />
          <span className="sk w70" />
          <span className="sk w90" />
        </div>
      ) : null}
      {items.map((it) => {
        if (it.kind === "day") {
          return (
            <div key={it.key} data-stream-key={it.key}>
              <DaySeparator label={dayLabel(it.date, shell, now, locale)} variant={variant} />
            </div>
          );
        }
        if (it.kind === "unread") {
          return (
            <div key={it.key} data-stream-key={it.key}>
              <UnreadDivider count={it.count} copy={kit} variant={variant} />
            </div>
          );
        }
        if (it.kind === "system") {
          return (
            <div key={it.key} data-stream-key={it.key}>
              <SystemLine text={it.message.body || it.message.kind} variant={variant} />
            </div>
          );
        }
        if (it.kind === "card") {
          return (
            <div key={it.key} data-stream-key={it.key}>
              <ThreadCard message={it.message} cardKind={it.cardKind} clientName={clientName} copy={copy} variant={variant} locale={locale} onAction={onAction} onCopyText={onCopyText} origin={origin} />
            </div>
          );
        }
        const m = it.message;
        const who = it.fromClient ? clientName : it.mine ? shell.you : shell.staff;
        const metaParts = [who, formatTime(m.createdAt, locale)];
        if (it.fromClient && m.delivery?.channel) metaParts.push((kit.channel as Record<string, string>)[m.delivery.channel] ?? m.delivery.channel);
        const voice = m.kind === "voice" ? { durationLabel: String((m.payload as { voice?: { durationLabel?: string } } | null)?.voice?.durationLabel ?? kit.stream.voice) } : null;
        return (
          <div key={it.key} data-stream-key={it.key}>
            <MessageBubble message={m} mine={it.mine} copy={kit} meta={metaParts.join(" · ")} position={it.position} delivery={it.mine ? deliveryStateFor(m.delivery) : null} voice={voice} variant={variant} onRetry={m.delivery?.state === "failed" ? () => onAction("reply") : undefined} />
          </div>
        );
      })}
      {mergeSlot}
      {captureSlot}
    </div>
  );

  const next = <NextStepWire tasks={tasks} state={state} copy={copy} variant={variant} loading={messages === null && !error} busy={nextBusy} onAction={(id) => onAction(id)} onMoreTasks={onMoreTasks} />;

  return (
    <section className="pane thread" data-thread={row.id} aria-label={kit.thread.details}>
      <div className="menu-anchor">
        {header}
        {menu}
      </div>
      {detailsAction && !mobile ? (
        <div className="th-head r2-details">
          <Btn size="sm" variant="secondary" onClick={detailsAction.onClick} data-thread-details>
            {detailsAction.label} <Icon name="chev" size={12} />
          </Btn>
        </div>
      ) : null}
      {mobile && detailsAction ? <EssentialsStrip state={state} chips={chips} amountLabel={null} copy={kit} onDetails={detailsAction.onClick} /> : null}
      {renameSlot}
      {stream}
      {mobile ? next : null}
      <ComposerWire {...composer} copy={copy} variant={variant} above={mobile ? undefined : next} />
    </section>
  );
}

export function ThreadEmpty({ copy, variant }: { copy: ScreenCopy; variant: ScreenVariant }) {
  return (
    <section className="pane thread" data-thread="none">
      <div className="thread-empty">
        <EmptyState icon="chat" title={copy.shell.noThreadTitle} body={copy.shell.noThreadBody} variant={variant} />
      </div>
    </section>
  );
}
