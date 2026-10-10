"use client";

/**
 * Talent Settings, Instagram: connect once and the latest posts feed the
 * `social_feed` block on the talent's own website.
 *
 * Free plans see an upsell. Paid plans move through connect, connected
 * (handle, last sync, Sync now, Disconnect) and reconnect (expired or failing
 * token). Connect leaves for the shared OAuth start route and comes back to
 * this page with `connection_*` params, which become a one-time notice.
 */

import { useEffect, useState, useTransition } from "react";

import { SettingsCardLoading } from "@/app/(workspace)/[tenantSlug]/talent/settings/SettingsCardLoading";
import { usePresenceText } from "@/components/talent/studio/presence-i18n";
import { disconnectTalentIntegrationAction } from "@/lib/talent-integrations/actions";
import {
  loadTalentInstagramCardAction,
  syncTalentInstagramAction,
} from "@/lib/talent-integrations/instagram-actions";
import {
  readTalentInstagramReturnNotice,
  talentInstagramConnectHref,
  TALENT_INSTAGRAM_RETURN_MARKER,
  type TalentInstagramCardState,
  type TalentInstagramReturnNotice,
} from "@/lib/talent-integrations/instagram-card-state";

const NOTICE_COPY: Record<Exclude<TalentInstagramReturnNotice["key"], "connected">, string> = {
  cancelled: "You cancelled the Instagram connection.",
  not_business:
    "Instagram did not accept the connection. Make sure your account is Business or Creator, then try again.",
  not_authorized: "We could not confirm it was you. Please try again.",
  unavailable: "Instagram connection is not available yet. We will let you know when it is.",
  generic: "Something went wrong while connecting. Please try again.",
};

const RETURN_PARAMS = [
  "connection_success",
  "connection_account",
  "connection_error",
  "connection_message",
  TALENT_INSTAGRAM_RETURN_MARKER,
];

const BTN_PRIMARY =
  "inline-flex cursor-pointer items-center rounded-[8px] border-0 bg-admin-ink px-[12px] py-[7px] text-[12.5px] font-semibold text-white disabled:cursor-default disabled:opacity-60";
const BTN_SECONDARY =
  "inline-flex cursor-pointer items-center rounded-[8px] border border-admin-border bg-admin-card px-[12px] py-[7px] text-[12.5px] font-semibold text-admin-ink disabled:cursor-default disabled:opacity-60";

function InstagramGlyph() {
  return (
    <span
      aria-hidden
      className="inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[8px] bg-admin-accent-soft text-admin-accent-deep"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function TalentInstagramCard({ onUpgrade }: { onUpgrade: () => void }) {
  const { t, es } = usePresenceText();
  const [state, setState] = useState<TalentInstagramCardState | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    const search = new URLSearchParams(window.location.search);
    const notice = readTalentInstagramReturnNotice(search);
    if (notice) {
      setMessage(
        notice.key === "connected"
          ? { tone: "ok", text: t("Instagram connected.") }
          : { tone: "error", text: t(NOTICE_COPY[notice.key]) },
      );
      for (const key of RETURN_PARAMS) search.delete(key);
      const query = search.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
    void loadTalentInstagramCardAction()
      .then((res) => {
        if (!live) return;
        if (res.ok) setState(res.state);
        else setMessage({ tone: "error", text: res.error });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // Runs once on mount: the return params are read a single time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function connect() {
    window.location.assign(
      talentInstagramConnectHref(`${window.location.pathname}${window.location.search}`),
    );
  }

  function syncNow() {
    setMessage(null);
    startTransition(async () => {
      const res = await syncTalentInstagramAction();
      if (!res.ok) {
        setMessage({ tone: "error", text: res.error });
        return;
      }
      setState(res.state);
    });
  }

  function disconnect() {
    setMessage(null);
    startTransition(async () => {
      const res = await disconnectTalentIntegrationAction({ providerKey: "instagram" });
      setConfirmingDisconnect(false);
      if (!res.ok) {
        setMessage({ tone: "error", text: res.error });
        return;
      }
      const next = await loadTalentInstagramCardAction();
      if (next.ok) setState(next.state);
      setMessage({ tone: "ok", text: t("Instagram disconnected.") });
    });
  }

  if (!state) return <SettingsCardLoading label={t("Loading Instagram…")} />;

  const formatWhen = (iso: string | null) => {
    if (!iso) return t("Not synced yet");
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return t("Not synced yet");
    return new Intl.DateTimeFormat(es ? "es" : "en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const disconnectControls = confirmingDisconnect ? (
    <>
      <span className="text-[12px] text-admin-ink-muted">
        {t("Disconnect Instagram? Your website stops showing your posts.")}
      </span>
      <button type="button" className={BTN_PRIMARY} disabled={pending} onClick={disconnect}>
        {t("Yes, disconnect")}
      </button>
      <button
        type="button"
        className={BTN_SECONDARY}
        disabled={pending}
        onClick={() => setConfirmingDisconnect(false)}
      >
        {t("Cancel")}
      </button>
    </>
  ) : (
    <button
      type="button"
      className={BTN_SECONDARY}
      disabled={pending}
      onClick={() => setConfirmingDisconnect(true)}
    >
      {t("Disconnect")}
    </button>
  );

  let body: React.ReactNode;
  let actions: React.ReactNode = null;
  switch (state.kind) {
    case "upsell":
      body = (
        <>
          <p className="m-0 text-[13px] font-medium text-admin-ink">
            {t("Show your Instagram posts on your website with a paid plan.")}
          </p>
          <p className="m-0 mt-[2px] text-[12px] text-admin-ink-muted">
            {state.connectedHandle
              ? `${t("Still connected as")} @${state.connectedHandle}`
              : t("Your latest posts appear on their own, in your website's style.")}
          </p>
        </>
      );
      actions = (
        <>
          <button type="button" className={BTN_PRIMARY} onClick={onUpgrade}>
            {t("See plans")}
          </button>
          {state.connectedHandle ? disconnectControls : null}
        </>
      );
      break;
    case "unavailable":
      body = (
        <p className="m-0 text-[12.5px] text-admin-ink-muted">
          {t("Instagram connection is not available yet. We will let you know when it is.")}
        </p>
      );
      break;
    case "connect":
      body = (
        <>
          <p className="m-0 text-[13px] font-medium text-admin-ink">
            {t("Show your latest Instagram posts on your website.")}
          </p>
          <p className="m-0 mt-[2px] text-[12px] text-admin-ink-muted">
            {t("Connect once and they update on their own. Works with Business and Creator accounts.")}
          </p>
        </>
      );
      actions = (
        <button type="button" className={BTN_PRIMARY} onClick={connect}>
          {t("Connect Instagram")}
        </button>
      );
      break;
    case "connected":
      body = (
        <>
          <p className="m-0 text-[13px] font-medium text-admin-ink">
            {t("Connected as")} {state.handle ? `@${state.handle}` : "Instagram"}
          </p>
          <p className="m-0 mt-[2px] text-[12px] text-admin-ink-muted">
            {t("Last sync")}: {formatWhen(state.lastSyncAt)}
          </p>
        </>
      );
      actions = (
        <>
          <button type="button" className={BTN_SECONDARY} disabled={pending} onClick={syncNow}>
            {pending ? t("Syncing…") : t("Sync now")}
          </button>
          {disconnectControls}
        </>
      );
      break;
    case "reconnect":
      body = (
        <>
          <p className="m-0 text-[13px] font-medium text-admin-amber-deep">
            {state.reason === "expired"
              ? t("Instagram stopped letting us read your posts. Reconnect to keep your feed up to date.")
              : t("We could not reach Instagram on the last try. Your website keeps showing your last posts.")}
          </p>
          {state.handle ? (
            <p className="m-0 mt-[2px] text-[12px] text-admin-ink-muted">@{state.handle}</p>
          ) : null}
        </>
      );
      actions = (
        <>
          {state.reason === "expired" ? (
            <button type="button" className={BTN_PRIMARY} onClick={connect}>
              {t("Reconnect")}
            </button>
          ) : (
            <button type="button" className={BTN_PRIMARY} disabled={pending} onClick={syncNow}>
              {pending ? t("Syncing…") : t("Try again")}
            </button>
          )}
          {disconnectControls}
        </>
      );
      break;
  }

  return (
    <div
      data-testid="talent-instagram-card"
      data-state={state.kind}
      className="flex w-full flex-col gap-[10px] rounded-[12px] border border-admin-border-soft bg-admin-card px-[16px] py-[14px] font-admin-body"
    >
      <div className="flex items-start gap-[12px]">
        <InstagramGlyph />
        <div className="min-w-0 flex-1">{body}</div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-[8px] pl-[44px]">{actions}</div> : null}
      {message ? (
        <p
          role="status"
          className={`m-0 pl-[44px] text-[12px] ${
            message.tone === "ok" ? "text-admin-success-deep" : "text-admin-critical"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
