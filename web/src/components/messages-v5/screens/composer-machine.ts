/**
 * The composer's state machine, pure (boards D01, D10, D16, D22, M08).
 * `ComposerWire.tsx` runs it with `useReducer`; the tests drive it directly.
 *
 * Seven kit states come out of four facts: resolved (locked), online, the
 * send status, and whether there is text. A refusal keeps the text; a
 * version conflict is resolved by the shell (reload, keep text) and lands
 * here as `conflict_reloaded`, an OkLine, not a refusal.
 */

import type { MessagingChannel, MessagingRefusal } from "@/lib/messaging/types";

import type { ComposerMode, ComposerState } from "../kit/Composer";

export type SendStatus = "idle" | "sending" | "failed" | "refused";

export type ComposerWireState = {
  readonly mode: ComposerMode;
  readonly value: string;
  readonly status: SendStatus;
  readonly refusal: MessagingRefusal | null;
  readonly channel: MessagingChannel;
  readonly online: boolean;
  readonly resolved: boolean;
  /** One green line after a send, a note, an attachment, a conflict reload. */
  readonly ok: string | null;
};

export type ComposerEvent =
  | { readonly type: "change"; readonly value: string }
  | { readonly type: "mode"; readonly mode: ComposerMode }
  | { readonly type: "channel"; readonly channel: MessagingChannel }
  | { readonly type: "send" }
  | { readonly type: "sent"; readonly ok?: string | null }
  | { readonly type: "failed" }
  | { readonly type: "refused"; readonly reason: MessagingRefusal }
  | { readonly type: "conflict_reloaded"; readonly text: string }
  | { readonly type: "online"; readonly online: boolean }
  | { readonly type: "resolved"; readonly resolved: boolean }
  | { readonly type: "ok"; readonly text: string | null }
  | { readonly type: "retry" }
  | { readonly type: "load_draft"; readonly value: string };

export function initialComposerState(input: { channel: MessagingChannel; resolved: boolean; online?: boolean; value?: string }): ComposerWireState {
  return {
    mode: "reply",
    value: input.value ?? "",
    status: "idle",
    refusal: null,
    channel: input.channel,
    online: input.online ?? true,
    resolved: input.resolved,
    ok: null,
  };
}

export function composerReducer(state: ComposerWireState, event: ComposerEvent): ComposerWireState {
  switch (event.type) {
    case "change":
      // Typing after a refusal or a failure clears the line; the text is the fix.
      return { ...state, value: event.value, status: state.status === "sending" ? state.status : "idle", refusal: null, ok: null };
    case "load_draft":
      return { ...state, value: event.value, status: "idle", refusal: null, ok: null };
    case "mode":
      return { ...state, mode: event.mode, refusal: null, status: state.status === "sending" ? state.status : "idle" };
    case "channel":
      return { ...state, channel: event.channel };
    case "send":
      if (state.resolved || !state.online || state.status === "sending" || state.value.trim() === "") return state;
      return { ...state, status: "sending", refusal: null, ok: null };
    case "sent":
      return { ...state, value: "", status: "idle", refusal: null, ok: event.ok ?? null };
    case "failed":
      return { ...state, status: "failed", refusal: null };
    case "refused":
      return { ...state, status: "refused", refusal: event.reason };
    case "conflict_reloaded":
      return { ...state, value: event.text, status: "idle", refusal: null, ok: null };
    case "online":
      return { ...state, online: event.online, status: event.online && state.status === "failed" ? "idle" : state.status };
    case "resolved":
      return { ...state, resolved: event.resolved, refusal: event.resolved ? null : state.refusal, status: event.resolved ? "idle" : state.status };
    case "ok":
      return { ...state, ok: event.text };
    case "retry":
      if (state.status !== "failed") return state;
      return { ...state, status: "sending" };
    default:
      return state;
  }
}

/** The kit `Composer` state for the machine's facts. */
export function kitStateFor(state: ComposerWireState): ComposerState {
  if (state.resolved) return "resolved";
  if (!state.online) return "offline";
  if (state.status === "sending") return "sending";
  if (state.status === "failed") return "failed";
  if (state.status === "refused") return "refused";
  return state.value.trim() ? "typing" : "idle";
}

/**
 * A refusal the shell must act on rather than show: the thread moved under
 * the operator (D10 "This conversation just changed. Reload and try again.").
 */
export function isVersionConflict(reason: MessagingRefusal): boolean {
  return reason === "conflict" || reason === "version_stale";
}

/** A resolved thread refuses a reply; the composer's own Reopen is the fix. */
export function isResolvedRefusal(reason: MessagingRefusal): boolean {
  return reason === "already_resolved";
}

export type ChannelAvailability = "on" | "not_connected" | "coming" | "quiet";

/**
 * "Send via" options over MESSAGING_CHANNELS: web_chat is always on,
 * whatsapp needs the connected drawer, sms is coming (no adapter today),
 * email is on, counter is a note on the thread (nothing is sent).
 */
export function channelAvailability(channel: MessagingChannel, input: { whatsappConnected: boolean }): ChannelAvailability {
  switch (channel) {
    case "web_chat":
    case "email":
      return "on";
    case "whatsapp":
      return input.whatsappConnected ? "on" : "not_connected";
    case "sms":
      return "coming";
    case "counter":
      return "quiet";
    default:
      return "coming";
  }
}

/** The fallback the composer names under "Send via": email when the client is away from web chat. */
export function fallbackFor(channel: MessagingChannel): MessagingChannel | null {
  if (channel === "web_chat" || channel === "whatsapp") return "email";
  return null;
}
