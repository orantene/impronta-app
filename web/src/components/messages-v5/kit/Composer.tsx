"use client";

/**
 * Composer (boards D01, D10, D16, M02, M08): Reply / Internal note toggle,
 * "Send via <channel> · fallback" control, plus tray, attach, voice, send.
 * States: idle, typing, sending, failed (with retry), offline, resolved
 * (locked, Reopen), refused (a refusal sentence with one action).
 */

import type { ReactNode } from "react";

import type { MessagingChannel, MessagingRefusal } from "@/lib/messaging/types";

import type { KitCopy } from "./copy";
import { fill } from "./copy";
import { Btn, Chip, Icon } from "./primitives";
import { OkLine, RefusalLine, type LineAction } from "./RefusalLine";

export type ComposerMode = "reply" | "note";
export type ComposerState = "idle" | "typing" | "sending" | "failed" | "offline" | "resolved" | "refused";

export type ComposerProps = {
  readonly mode: ComposerMode;
  readonly value: string;
  readonly state: ComposerState;
  readonly channel: MessagingChannel;
  readonly copy: KitCopy;
  readonly variant?: "desktop" | "mobile";
  /** Fallback channel when the client is away (email if away). Null hides the sentence. */
  readonly fallbackChannel?: MessagingChannel | null;
  readonly refusal?: MessagingRefusal | null;
  readonly refusalAction?: LineAction | null;
  readonly okText?: string | null;
  readonly suggestions?: readonly string[];
  readonly onModeChange?: (mode: ComposerMode) => void;
  readonly onChange?: (value: string) => void;
  readonly onSend?: () => void;
  readonly onRetry?: () => void;
  readonly onReopen?: () => void;
  readonly onPlus?: () => void;
  readonly onAttach?: () => void;
  readonly onVoice?: () => void;
  readonly onChannel?: () => void;
  readonly onSuggestion?: (text: string) => void;
  /** Slot above the box (the NextStepBar on desktop). */
  readonly above?: ReactNode;
  readonly textareaId?: string;
};

export function Composer(props: ComposerProps) {
  const { mode, value, state, channel, copy, variant = "desktop", fallbackChannel, refusal, refusalAction, okText, suggestions, onModeChange, onChange, onSend, onRetry, onReopen, onPlus, onAttach, onVoice, onChannel, onSuggestion, above, textareaId } = props;
  const c = copy.composer;
  const note = mode === "note";
  const locked = state === "resolved";
  const sending = state === "sending";
  const canSend = value.trim().length > 0 && !locked && !sending && state !== "offline";
  const mobile = variant === "mobile";
  const id = textareaId ?? `msgv5-composer-${variant}`;

  const modeSeg = (
    <span className={mobile ? "mx-seg small" : "seg compact"} role="tablist">
      <button type="button" role="tab" aria-selected={!note} className={note ? "" : "on"} onClick={() => onModeChange?.("reply")} disabled={locked}>
        {c.reply}
      </button>
      <button type="button" role="tab" aria-selected={note} className={note ? "on" : ""} onClick={() => onModeChange?.("note")} disabled={locked}>
        {c.note}
      </button>
    </span>
  );

  const via = note ? (
    <span className="fb">{c.teamOnly}</span>
  ) : (
    <>
      <button type="button" className="via" onClick={onChannel} disabled={locked} data-composer-via>
        <span className="lb">{mobile ? c.via : c.sendVia}</span>
        {copy.channel[channel]} <Icon name="chev" size={12} />
      </button>
      {!mobile && fallbackChannel ? <span className="fb">{fill(c.fallback, { channel: copy.channel[fallbackChannel] })}</span> : null}
    </>
  );

  const lines = (
    <>
      {state === "refused" && refusal ? <RefusalLine code={refusal} copy={copy} action={refusalAction} variant={variant} /> : null}
      {okText ? <OkLine text={okText} variant={variant} /> : null}
      {state === "failed" ? (
        <div className={mobile ? "mx-line err" : "refuse"} role="alert" data-composer-failed>
          <Icon name="alert" size={14} />
          <span>{c.failed}</span>
          <Btn size="sm" onClick={onRetry}>
            {c.retry}
          </Btn>
        </div>
      ) : null}
      {state === "offline" ? (
        <div className={mobile ? "mx-line warn" : "alertline"} role="status" data-composer-offline>
          <Icon name="alert" size={14} />
          <span>{c.offline}</span>
        </div>
      ) : null}
      {locked ? (
        <div className={mobile ? "mx-line lock" : "alertline"} role="status" data-composer-locked>
          <Icon name="lock" size={14} />
          <span>{c.resolvedLocked}</span>
          <Btn size="sm" onClick={onReopen}>
            {c.reopen}
          </Btn>
        </div>
      ) : null}
    </>
  );

  const box = (
    <div className={`box${!mobile && note ? " note" : ""}${locked ? " locked" : ""}`}>
      <button type="button" className="plus" onClick={onPlus} disabled={locked} aria-label={c.more}>
        <Icon name="plus" size={mobile ? 20 : 16} />
      </button>
      <label htmlFor={id} className="sr">
        {note ? c.notePlaceholder : c.placeholder}
      </label>
      <textarea id={id} className={mobile ? "in" : "t"} rows={1} value={value} placeholder={note ? c.notePlaceholder : c.placeholder} disabled={locked || sending} onChange={(e) => onChange?.(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSend) { e.preventDefault(); onSend?.(); } }} data-composer-input />
      <button type="button" className="tool" onClick={onAttach} disabled={locked} aria-label={c.attach}>
        <Icon name="clip" size={mobile ? 18 : 16} />
      </button>
      <button type="button" className="tool" onClick={onVoice} disabled={locked} aria-label={c.voice}>
        <Icon name="mic" size={mobile ? 18 : 16} />
      </button>
      <button type="button" className={`send${canSend ? "" : " off"}`} onClick={onSend} disabled={!canSend} aria-label={sending ? c.sending : c.send} aria-busy={sending || undefined} data-composer-send>
        <Icon name="send" size={mobile ? 16 : 15} />
      </button>
    </div>
  );

  if (mobile) {
    return (
      <div className={`mx-cmp${note ? " note" : ""}`} data-composer={state} data-composer-mode={mode}>
        {lines}
        {above}
        <div className="mode">
          {modeSeg}
          <span className="to">{via}</span>
        </div>
        {box}
      </div>
    );
  }

  return (
    <div className="composer" data-composer={state} data-composer-mode={mode}>
      {lines}
      {above}
      {suggestions && suggestions.length ? (
        <div className="sugg">
          {suggestions.map((s) => (
            <Chip key={s} soft onClick={onSuggestion ? () => onSuggestion(s) : undefined}>
              {s}
            </Chip>
          ))}
        </div>
      ) : null}
      <div className="mode">
        {modeSeg}
        {via}
      </div>
      {box}
    </div>
  );
}
