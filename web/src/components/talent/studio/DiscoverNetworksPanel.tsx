"use client";

import { useEffect, useState, type ReactNode } from "react";
import { listOwnApplications, type OwnApplicationRow } from "@/lib/talent/apply-actions";
import {
  LOCAL_NETWORKS,
  networkState,
  setNetworkState,
  type LocalNetwork,
  type LocalNetworkState,
} from "@/lib/talent/local-networks";
import {
  applicationTimeline,
  filterNetworks,
  networkPrimaryAction,
  type NetworkFilter,
} from "@/lib/talent/presence-placements";
import { usePresenceText } from "./presence-i18n";

type View = "browse" | "detail" | "review" | "result" | "apply";

/** Solid next-step fill — L44 PrimaryButton contract (`--tulala-primary-fill` on talent grid). */
const BTN_PRIMARY =
  "inline-flex min-h-11 items-center rounded-full border border-[var(--tulala-primary-fill)] bg-[var(--tulala-primary-fill)] px-5 text-[13px] font-semibold text-white hover:border-[var(--tulala-primary-fill-deep)] hover:bg-[var(--tulala-primary-fill-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tulala-primary-fill)] disabled:cursor-not-allowed disabled:opacity-50";
const BTN_SECONDARY =
  "inline-flex min-h-11 items-center rounded-full border border-admin-border-soft bg-white px-4 text-[13px] font-semibold text-admin-ink";
const BTN_QUIET = "inline-flex min-h-11 items-center px-3 text-[13px] font-semibold text-admin-ink-muted";

/**
 * My presence › Discover networks. Browsing shares nothing and joins nothing.
 * Joining is reviewed and confirmed; applying is not joining; leaving is a
 * separate confirmation from hiding. Networks are a local seed until the
 * network directory ships, and the page says so.
 */
export function DiscoverNetworksPanel({ talentId }: { talentId: string | null }) {
  const { t, es } = usePresenceText();
  const [view, setView] = useState<View>("browse");
  const [selected, setSelected] = useState<LocalNetwork | null>(null);
  const [filter, setFilter] = useState<NetworkFilter>({ query: "", access: "any" });
  const [dialog, setDialog] = useState<"hide" | "leave" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [applications, setApplications] = useState<OwnApplicationRow[]>([]);
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);

  useEffect(() => {
    if (!talentId) return;
    let live = true;
    void listOwnApplications()
      .then((res) => {
        if (live && res.ok) setApplications(res.items);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [talentId]);

  if (!talentId) {
    return <p className="font-admin-body text-[14px] text-admin-ink-muted">{t("Not available")}</p>;
  }

  const stateOf = (n: LocalNetwork): LocalNetworkState => networkState(talentId, n.id);
  const commit = (n: LocalNetwork, next: LocalNetworkState) => {
    setNetworkState(talentId, n.id, next);
    refresh();
  };
  const backToList = () => {
    setView("browse");
    setSelected(null);
    setDialog(null);
    setSubmitting(false);
  };
  const stateLabel = (s: LocalNetworkState) =>
    s === "joined" ? t("Joined") : s === "pending" ? t("Application sent") : s === "hidden" ? t("Hidden") : "";

  // ── A network ────────────────────────────────────────────────────────────
  if (selected && view !== "browse") {
    const state = stateOf(selected);
    const action = networkPrimaryAction(selected.access, state);
    const facts: Array<[string, string]> = [
      [t("Who runs it"), t(selected.operator)],
      [t("Who it is for"), t(selected.forWho)],
      [t("Where"), t(selected.city)],
      [t("Cost"), `${t(selected.fee)}, ${t("as stated by the network")}`],
      [t("Client enquiries"), t(selected.enquiries)],
      [t("Publishing"), t(selected.publishing)],
    ];

    return (
      <div className="font-admin-body text-admin-ink">
        <button type="button" className={BTN_QUIET + " -ml-3"} onClick={backToList}>
          ← {t("Back to networks")}
        </button>

        {view === "detail" && (
          <>
            <h2 className="mt-2 font-admin-display text-[24px] font-semibold">{selected.name}</h2>
            <p className="mt-1 text-[13px] text-admin-ink-muted">{t(selected.summary)}</p>
            {state !== "none" && <p className="mt-2 text-[13px] font-semibold">{stateLabel(state)}</p>}
            <dl className="mt-4 divide-y divide-admin-border-soft overflow-hidden rounded-2xl border border-admin-border-soft bg-white">
              {facts.map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
                  <dt className="w-40 shrink-0 text-[12px] text-admin-ink-muted">{k}</dt>
                  <dd className="text-[13px]">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[12px] text-admin-ink-muted">
              {t("Joining is not representation. It does not make the network your agency and it does not require Web Office.")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {action === "join" && (
                <button type="button" className={BTN_PRIMARY} onClick={() => setView("review")}>
                  {t("Review what is shared")}
                </button>
              )}
              {action === "apply" && (
                <button type="button" className={BTN_PRIMARY} onClick={() => setView("apply")}>
                  {t("Apply")}
                </button>
              )}
              {action === "invite_only" && (
                <p className="text-[13px] text-admin-ink-muted">{t("By invitation only.")}</p>
              )}
              {state === "joined" && (
                <>
                  <button type="button" className={BTN_SECONDARY} onClick={() => setDialog("hide")}>
                    {t("Hide")}
                  </button>
                  <button type="button" className={BTN_QUIET} onClick={() => setDialog("leave")}>
                    {t("Leave network")}
                  </button>
                </>
              )}
              {state === "hidden" && (
                <>
                  <button type="button" className={BTN_PRIMARY} onClick={() => commit(selected, "joined")}>
                    {t("Show it again")}
                  </button>
                  <button type="button" className={BTN_QUIET} onClick={() => setDialog("leave")}>
                    {t("Leave network")}
                  </button>
                </>
              )}
            </div>
            {state === "pending" && <Timeline status="pending" />}
          </>
        )}

        {view === "review" && (
          <>
            <h2 className="mt-2 font-admin-display text-[22px] font-semibold">
              {t("Join")} {selected.name}?
            </h2>
            <p className="mt-1 text-[13px] text-admin-ink-muted">
              {t("This creates a listing there using the public profile information below.")}
            </p>
            <div className="mt-4 rounded-2xl border border-admin-border-soft bg-white p-4 text-[13px]">
              <p className="font-semibold">{t("They will see:")}</p>
              <p className="mt-1 text-admin-ink-muted">
                {t("Your name, photo, specialty, city, public services and prices, and public reviews.")}
              </p>
              <p className="mt-3 font-semibold">{t("Never shared")}</p>
              <p className="mt-1 text-admin-ink-muted">
                {t("Your phone, email, clients, bookings and money.")}
              </p>
              <p className="mt-3 font-semibold">{t("Visibility")}</p>
              <p className="mt-1 text-admin-ink-muted">{t("Public on the network as soon as you join.")}</p>
              <p className="mt-3 font-semibold">{t("Client enquiries")}</p>
              <p className="mt-1 text-admin-ink-muted">{t(selected.enquiries)}</p>
              <p className="mt-3 font-semibold">{t("Cost")}</p>
              <p className="mt-1 text-admin-ink-muted">
                {t(selected.fee)}, {t("as stated by the network")}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={submitting}
                onClick={() => {
                  setSubmitting(true);
                  commit(selected, "joined");
                  setView("result");
                  setSubmitting(false);
                }}
              >
                {t("Join network")}
              </button>
              <button type="button" className={BTN_QUIET} onClick={() => setView("detail")}>
                {t("Cancel")}
              </button>
            </div>
          </>
        )}

        {view === "result" && (
          <div className="mt-2 rounded-2xl border border-admin-border-soft bg-white p-4">
            <h2 className="font-admin-display text-[20px] font-semibold">
              {t("You joined")} {selected.name}.
            </h2>
            <p className="mt-1 text-[13px] text-admin-ink-muted">
              {t("This network is a local preview, so no public listing was created and nothing was sent.")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={() => setView("detail")}>
                {t("Listing details")}
              </button>
              <button type="button" className={BTN_QUIET} onClick={backToList}>
                {t("Back to networks")}
              </button>
            </div>
          </div>
        )}

        {view === "apply" && (
          <>
            <h2 className="mt-2 font-admin-display text-[22px] font-semibold">
              {t("Apply to")} {selected.name}
            </h2>
            <p className="mt-1 text-[13px] text-admin-ink-muted">
              {t("Sending an application · this is not joining yet")}
            </p>
            <div className="mt-4 rounded-2xl border border-admin-border-soft bg-white p-4 text-[13px]">
              <p className="font-semibold">{t("Also sent, from your profile")}</p>
              <p className="mt-1 text-admin-ink-muted">
                {t("Your name, photo, specialty, city, public services and prices, and public reviews.")}
              </p>
              <p className="mt-3 font-semibold">{t("Their questions")}</p>
              <p className="mt-1 text-admin-ink-muted">{t("This network asks no extra questions.")}</p>
              <p className="mt-3 text-admin-ink-muted">
                {t("Acceptance does not publish your listing on its own; they do that as a separate step.")}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={submitting}
                onClick={() => {
                  setSubmitting(true);
                  commit(selected, "pending");
                  setView("detail");
                  setSubmitting(false);
                }}
              >
                {t("Submit application")}
              </button>
              <button type="button" className={BTN_QUIET} onClick={() => setView("detail")}>
                {t("Cancel")}
              </button>
            </div>
          </>
        )}

        {dialog === "hide" && (
          <Dialog
            title={t("Hide this listing?")}
            onCancel={() => setDialog(null)}
            actions={
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={() => {
                  commit(selected, "hidden");
                  setDialog(null);
                }}
              >
                {t("Hide it")}
              </button>
            }
          >
            <ul className="space-y-2 text-[13px]">
              <li>{t("Your listing there is hidden")}</li>
              <li>{t("You stay a member")}</li>
              <li>{t("Existing bookings stay as they are")}</li>
              <li>{t("You can show it again in one tap")}</li>
            </ul>
          </Dialog>
        )}
        {dialog === "leave" && (
          <Dialog
            title={`${t("Leave")} ${selected.name}?`}
            onCancel={() => setDialog(null)}
            actions={
              <>
                {state === "joined" && (
                  <button type="button" className={BTN_SECONDARY} onClick={() => setDialog("hide")}>
                    {t("Hide instead")}
                  </button>
                )}
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  onClick={() => {
                    commit(selected, "none");
                    setDialog(null);
                  }}
                >
                  {t("Leave network")}
                </button>
              </>
            }
          >
            <ul className="space-y-2 text-[13px]">
              <li>{t("Your listing there is removed")}</li>
              <li>{t("No new enquiries from them. Clients who find you elsewhere can still reach you.")}</li>
              <li>{t("Bookings you already have from them stay. Dates, prices and payments are unchanged.")}</li>
              <li>{t("You can join again later.")}</li>
            </ul>
            <p className="mt-3 text-[12px] text-admin-ink-muted">
              {t("Only want to be less visible for a while? Hiding keeps your membership and can be undone in one tap.")}
            </p>
          </Dialog>
        )}
      </div>
    );
  }

  // ── Browse ───────────────────────────────────────────────────────────────
  const shown = filterNetworks(LOCAL_NETWORKS, filter);
  return (
    <div className="font-admin-body text-admin-ink">
      <p className="mb-3 text-[13px] text-admin-ink-muted">{t("Places where more clients could find you")}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="search"
          value={filter.query}
          onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
          placeholder={t("Search networks")}
          aria-label={t("Search networks")}
          className="min-h-11 flex-1 basis-[200px] rounded-full border border-admin-border-soft bg-white px-4 text-[14px]"
        />
        <select
          value={filter.access}
          onChange={(e) => setFilter((f) => ({ ...f, access: e.target.value as NetworkFilter["access"] }))}
          aria-label={t("Membership")}
          className="min-h-11 rounded-full border border-admin-border-soft bg-white px-4 text-[14px]"
        >
          <option value="any">{t("Any membership")}</option>
          <option value="open">{t("Open to join")}</option>
          <option value="apply">{t("Apply")}</option>
          <option value="invite">{t("By invitation only.")}</option>
        </select>
      </div>
      <p className="mb-2 text-[12px] text-admin-ink-muted">
        {shown.length} {es ? (shown.length === 1 ? "red" : "redes") : shown.length === 1 ? "network" : "networks"} ·{" "}
        {t("Local preview. These networks are not live for other talents yet.")}
      </p>
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-admin-border-soft bg-admin-surface-alt px-4 py-6 text-center text-[13px] text-admin-ink-muted">
          {t("No network matches these filters.")}
        </p>
      ) : (
        <ul className="divide-y divide-admin-border-soft overflow-hidden rounded-2xl border border-admin-border-soft bg-white">
          {shown.map((net) => {
            const state = stateOf(net);
            const action = networkPrimaryAction(net.access, state);
            return (
              <li key={net.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  onClick={() => {
                    setSelected(net);
                    setView("detail");
                  }}
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold">{net.name}</span>
                    <span className="block text-[12px] text-admin-ink-muted">
                      {t(net.operator)} · {t(net.city)} · {t(net.fee)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold text-admin-ink-muted">
                    {state !== "none"
                      ? stateLabel(state)
                      : action === "join"
                        ? t("Open to join")
                        : action === "apply"
                          ? t("Apply")
                          : t("By invitation only.")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {applications.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-admin-ink-muted">
            {t("Your applications")} · {applications.length}
          </h3>
          <ul className="space-y-2">
            {applications.map((a) => (
              <li key={a.id} className="rounded-2xl border border-admin-border-soft bg-white px-4 py-3">
                <p className="text-[13px] font-semibold">
                  {a.kind === "hub" ? t("Network application") : t("Agency application")}
                  {a.createdAt ? ` · ${t("Sent")} ${new Date(a.createdAt).toLocaleDateString(es ? "es-MX" : "en-US", { day: "numeric", month: "short" })}` : ""}
                </p>
                <Timeline status={a.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Timeline({ status }: { status: string }) {
  const { t } = usePresenceText();
  const { steps, next } = applicationTimeline(status);
  return (
    <div className="mt-3">
      <ol className="space-y-1 text-[13px]">
        {steps.map((s) => (
          <li key={s.label} className={s.done ? "text-admin-ink" : "text-admin-ink-muted"}>
            {s.done ? "✓" : "○"} {t(s.label)}
          </li>
        ))}
      </ol>
      {next && (
        <p className="mt-2 text-[12px] text-admin-ink-muted">
          {t("Next")}: {t(next)}
        </p>
      )}
    </div>
  );
}

function Dialog({
  title,
  children,
  onCancel,
  actions,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  actions: ReactNode;
}) {
  const { t } = usePresenceText();
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" className="w-full max-w-[440px] rounded-2xl bg-white p-5">
        <h3 className="font-admin-display text-[20px]">{title}</h3>
        <div className="mt-3">{children}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={BTN_QUIET} onClick={onCancel}>
            {t("Cancel")}
          </button>
          {actions}
        </div>
      </div>
    </div>
  );
}
