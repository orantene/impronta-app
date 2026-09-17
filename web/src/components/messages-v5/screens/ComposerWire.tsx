"use client";

/**
 * ComposerWire (boards D01, D10, D16, D22, M02, M08): the kit Composer bound
 * to the engine. Reply → `messagingReply`, Internal note →
 * `messagingInternalNote`, "Send via" over MESSAGING_CHANNELS, attach through
 * the workspace's signed upload (internal only; shared is a seam), voice via
 * the existing recorder. Every state is the pure machine in
 * `composer-machine.ts`; the engine calls come in through `actions` so the
 * dev preview and the tests can run it with fixtures.
 */

import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";

import { uploadInquiryAttachmentSigned } from "@/lib/client/signed-upload";
import { messagingInternalNote, messagingReopen, messagingReply } from "@/lib/server-actions/messaging-engine";
import { MESSAGING_CHANNELS, type ActionResult, type MessagingChannel } from "@/lib/messaging/types";
import { VoiceRecorderButton } from "@/components/chat-interactions/VoiceRecorderButton";

import { Composer } from "../kit/Composer";
import { fill } from "../kit/copy";
import { OptionRow } from "../kit/OptionRow";
import { Btn } from "../kit/primitives";
import { AlertLine } from "../kit/RefusalLine";
import { Sheet } from "../kit/Sheet";
import { Tray, defaultTrayGroups, type TrayItemKey } from "../kit/Tray";
import { channelAvailability, composerReducer, fallbackFor, initialComposerState, isResolvedRefusal, isVersionConflict, kitStateFor } from "./composer-machine";
import type { ScreenVariant } from "./contracts";
import type { ScreenCopy } from "./copy";

export type ComposerActions = {
  readonly reply: (input: { inquiryId: string; body: string; channel: MessagingChannel; expectedVersion: number }) => Promise<ActionResult<{ messageId?: string }>>;
  readonly note: (input: { inquiryId: string; body: string }) => Promise<ActionResult<{ messageId?: string }>>;
  readonly reopen: (input: { inquiryId: string; expectedVersion: number }) => Promise<ActionResult<{ version?: number }>>;
  readonly upload: (input: { inquiryId: string; file: File }) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export const engineComposerActions: ComposerActions = {
  reply: (input) => messagingReply(input),
  note: (input) => messagingInternalNote(input),
  reopen: (input) => messagingReopen(input),
  upload: async (input) => {
    const result = await uploadInquiryAttachmentSigned(input);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  },
};

export type ComposerWireProps = {
  readonly inquiryId: string;
  /** The inquiry row's optimistic-lock counter; sent as `expectedVersion`. */
  readonly version: number;
  readonly channel: MessagingChannel;
  readonly resolved: boolean;
  readonly copy: ScreenCopy;
  readonly variant: ScreenVariant;
  readonly actions?: ComposerActions;
  readonly whatsappConnected: boolean;
  /** Draft text restored by the shell for this thread (initial value; key the component by inquiryId). */
  readonly draft: string;
  readonly onDraftChange: (value: string) => void;
  /** Called after any successful write so the shell reloads the thread and the inbox. */
  readonly onWrote: () => Promise<void> | void;
  /** Version conflict: the shell reloads and answers with the fresh version. */
  readonly onConflict: () => Promise<number | null>;
  /** Reopen succeeded: the shell refreshes state (the machine unlocks itself). */
  readonly onReopened: (version: number | null) => void;
  readonly onTray: (key: TrayItemKey) => void;
  readonly onComing: (seam: string) => void;
  readonly above?: ReactNode;
  readonly textareaId?: string;
  /** Bumped by the shell when something asks for an internal note (panel "Add note", tray). */
  readonly noteRequest?: number;
};

export function ComposerWire(props: ComposerWireProps) {
  const { inquiryId, version, channel, resolved, copy, variant, whatsappConnected, draft, onDraftChange, onWrote, onConflict, onReopened, onTray, onComing, above, textareaId } = props;
  const actions = props.actions ?? engineComposerActions;
  const kit = copy.kit;
  const shell = copy.shell;
  const [state, dispatch] = useReducer(composerReducer, { channel: channel === "counter" ? "web_chat" : channel, resolved, online: typeof navigator === "undefined" ? true : navigator.onLine, value: draft }, initialComposerState);
  const [sheet, setSheet] = useState<"via" | "attach" | "voice" | "tray" | null>(null);
  const [attachChoice, setAttachChoice] = useState<"internal" | "shared">("internal");
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const versionRef = useRef(version);
  const lastBodyRef = useRef("");
  const mobile = variant === "mobile";

  useEffect(() => {
    versionRef.current = version;
  }, [version]);
  useEffect(() => {
    dispatch({ type: "resolved", resolved });
  }, [resolved]);
  // The shell keys this component by inquiryId and hands the thread's draft
  // in as the initial value, so no effect reloads it here.
  useEffect(() => {
    if (props.noteRequest) dispatch({ type: "mode", mode: "note" });
  }, [props.noteRequest]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const on = () => dispatch({ type: "online", online: true });
    const off = () => dispatch({ type: "online", online: false });
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const change = useCallback(
    (value: string) => {
      dispatch({ type: "change", value });
      onDraftChange(value);
    },
    [onDraftChange],
  );

  const send = useCallback(async () => {
    const body = state.value.trim();
    if (!body || state.resolved || !state.online || state.status === "sending") return;
    lastBodyRef.current = state.value;
    dispatch({ type: "send" });
    try {
      const result =
        state.mode === "note"
          ? await actions.note({ inquiryId, body })
          : await actions.reply({ inquiryId, body, channel: state.channel, expectedVersion: versionRef.current });
      if (!result.ok) {
        if (isVersionConflict(result.reason)) {
          const fresh = await onConflict();
          if (fresh !== null) versionRef.current = fresh;
          dispatch({ type: "conflict_reloaded", text: lastBodyRef.current });
          dispatch({ type: "ok", text: shell.conflictReloaded });
          return;
        }
        if (isResolvedRefusal(result.reason)) {
          dispatch({ type: "resolved", resolved: true });
          return;
        }
        dispatch({ type: "refused", reason: result.reason });
        return;
      }
      dispatch({ type: "sent", ok: state.mode === "note" ? shell.noteOk : shell.sentOk });
      onDraftChange("");
      await onWrote();
    } catch {
      dispatch({ type: "failed" });
    }
  }, [actions, inquiryId, onConflict, onDraftChange, onWrote, shell.conflictReloaded, shell.noteOk, shell.sentOk, state]);

  const reopen = useCallback(async () => {
    const result = await actions.reopen({ inquiryId, expectedVersion: versionRef.current });
    if (!result.ok) {
      dispatch({ type: "refused", reason: result.reason });
      return;
    }
    if (typeof result.version === "number") versionRef.current = result.version;
    dispatch({ type: "resolved", resolved: false });
    onReopened(typeof result.version === "number" ? result.version : null);
  }, [actions, inquiryId, onReopened]);

  // Reopen then send: once the machine unlocks with text waiting, send it.
  const pendingAfterReopen = useRef(false);
  useEffect(() => {
    if (pendingAfterReopen.current && !state.resolved && state.value.trim()) {
      pendingAfterReopen.current = false;
      void send();
    }
  }, [send, state.resolved, state.value]);

  const onFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setAttachError(null);
      setSheet(null);
      const result = await actions.upload({ inquiryId, file });
      if (!result.ok) {
        setAttachError(shell.attachFailed);
        return;
      }
      dispatch({ type: "ok", text: fill(shell.attachDone, { name: file.name }) });
      await onWrote();
    },
    [actions, inquiryId, onWrote, shell.attachDone, shell.attachFailed],
  );

  const sheetVariant = mobile ? "mobile-h60" : "desktop";
  const pickTray = (key: TrayItemKey) => {
    if (key === "file") {
      setSheet("attach");
      return;
    }
    setSheet(null);
    onTray(key);
  };
  const via = (
    <Sheet open={sheet === "via"} title={shell.viaTitle} copy={kit} onClose={() => setSheet(null)} variant={sheetVariant}>
      <div className="via-list" data-via-list>
        {MESSAGING_CHANNELS.map((c) => {
          const avail = channelAvailability(c, { whatsappConnected });
          const sub = c === "web_chat" ? shell.viaAlwaysOn : c === "email" ? shell.viaEmail : c === "counter" ? shell.viaCounter : avail === "not_connected" ? shell.viaNotConnected : avail === "coming" ? shell.viaComing : null;
          const disabled = avail === "not_connected" || avail === "coming";
          return (
            <OptionRow
              key={c}
              control="radio"
              selected={state.channel === c}
              title={kit.channel[c]}
              sub={sub}
              disabled={disabled}
              variant={variant}
              onSelect={
                disabled
                  ? () => onComing(c === "sms" ? "sms channel" : "whatsapp not connected")
                  : () => {
                      dispatch({ type: "channel", channel: c });
                      setSheet(null);
                    }
              }
            />
          );
        })}
      </div>
    </Sheet>
  );

  const attach = (
    <Sheet
      open={sheet === "attach"}
      title={shell.attachTitle}
      copy={kit}
      onClose={() => setSheet(null)}
      variant={sheetVariant}
      footer={
        <Btn size="lg" variant="primary" fill onClick={() => (attachChoice === "shared" ? onComing("shared attachment visibility") : fileRef.current?.click())} data-attach-pick>
          {shell.attachPick}
        </Btn>
      }
    >
      <OptionRow control="radio" selected={attachChoice === "internal"} title={shell.attachInternal} sub={shell.attachInternalSub} variant={variant} onSelect={() => setAttachChoice("internal")} />
      <OptionRow control="radio" selected={attachChoice === "shared"} title={shell.attachShared} sub={shell.attachSharedSub} variant={variant} onSelect={() => setAttachChoice("shared")} />
    </Sheet>
  );

  const voice = (
    <Sheet open={sheet === "voice"} title={shell.voiceTitle} copy={kit} onClose={() => setSheet(null)} variant={sheetVariant}>
      <p className="sheet-note">{shell.voiceBody}</p>
      {sheet === "voice" ? (
        <VoiceRecorderButton
          inquiryId={inquiryId}
          threadType="private"
          onSent={() => {
            setSheet(null);
            void onWrote();
          }}
          onError={() => setAttachError(shell.attachFailed)}
        />
      ) : null}
    </Sheet>
  );

  const tray =
    sheet === "tray" ? (
      mobile ? (
        <Sheet open title={kit.composer.more} copy={kit} onClose={() => setSheet(null)} variant="mobile-h60" tight>
          <Tray groups={defaultTrayGroups(kit)} variant="mobile" onPick={pickTray} />
        </Sheet>
      ) : (
        <>
          <button type="button" className="scrim" aria-label={kit.sheet.close} onClick={() => setSheet(null)} />
          <Tray groups={defaultTrayGroups(kit)} floating onPick={pickTray} />
        </>
      )
    ) : null;

  return (
    <div className="cmp-anchor" data-composer-wire>
      {attachError ? <AlertLine text={attachError} variant={variant} action={{ label: kit.stream.retry, onClick: () => { setAttachError(null); setSheet("attach"); } }} /> : null}
      <Composer
        mode={state.mode}
        value={state.value}
        state={kitStateFor(state)}
        channel={state.channel}
        copy={kit}
        variant={variant}
        fallbackChannel={fallbackFor(state.channel)}
        refusal={state.refusal}
        refusalAction={state.refusal && isResolvedRefusal(state.refusal) ? { label: kit.composer.reopen, onClick: () => void reopen() } : null}
        okText={state.ok}
        onModeChange={(mode) => dispatch({ type: "mode", mode })}
        onChange={change}
        onSend={() => void send()}
        onRetry={() => void send()}
        onReopen={() => {
          pendingAfterReopen.current = state.value.trim().length > 0;
          void reopen();
        }}
        onPlus={() => setSheet("tray")}
        onAttach={() => setSheet("attach")}
        onVoice={() => setSheet("voice")}
        onChannel={() => setSheet("via")}
        above={above}
        textareaId={textareaId}
      />
      <input ref={fileRef} type="file" className="attach-input" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
      {via}
      {attach}
      {voice}
      {tray}
    </div>
  );
}
