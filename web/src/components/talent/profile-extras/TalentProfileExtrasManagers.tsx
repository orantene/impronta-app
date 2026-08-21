"use client";

/**
 * Editing surfaces for the Pro/Portfolio profile extras, mounted inside the
 * existing `TalentMediaEmbedsDrawer` / `TalentPressDrawer` (talent-drawers/
 * premium-pages.tsx). Those drawers previously rendered a DEMO FIXTURE that
 * belonged to another talent and discarded everything typed into them; these
 * components replace that with the real per-talent store.
 *
 * Both call server actions that re-check auth, ownership and the Pro/Portfolio
 * entitlement — nothing here is a security boundary, and `canManage` is a UX
 * affordance only. A denied write comes back as a message, never a silent no-op.
 */

import { useEffect, useState, useTransition } from "react";

import {
  Divider,
  FieldRow,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import {
  addTalentPressItemAction,
  addTalentProfileEmbedAction,
  fetchTalentProfileExtrasAction,
  removeTalentPressItemAction,
  removeTalentProfileEmbedAction,
  type TalentPressItem,
  type TalentProfileEmbed,
} from "@/lib/talent/profile-embeds/actions";

type SaveState = "idle" | "saving" | "saved" | "error";

function saveLabel(state: SaveState): string {
  if (state === "saving") return "Saving…";
  if (state === "saved") return "Saved";
  if (state === "error") return "Couldn't save";
  return "";
}

function StatusLine({
  state,
  message,
}: {
  state: SaveState;
  message: string | null;
}) {
  const label = saveLabel(state);
  if (!label && !message) return null;
  return (
    <div
      role="status"
      style={{ marginTop: 8, fontFamily: FONTS.body, fontSize: 12 }}
      className={state === "error" ? "text-admin-red" : "text-admin-ink-muted"}
    >
      {message ?? label}
    </div>
  );
}

function UpgradeNotice() {
  return (
    <div
      role="note"
      className="mb-3 rounded-[9px] border border-[rgba(91,107,160,0.25)] bg-[rgba(91,107,160,0.10)] px-3 py-2 text-[12px] leading-[1.5] text-admin-indigo-deep"
    >
      Social and video embeds and the press band are part of Pro. Upgrade to add
      them; anything you already added stays saved and you can still remove it.
    </div>
  );
}

function useProfileExtras(active: boolean) {
  const [embeds, setEmbeds] = useState<TalentProfileEmbed[]>([]);
  const [press, setPress] = useState<TalentPressItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!active || loaded) return;
    startTransition(async () => {
      const result = await fetchTalentProfileExtrasAction();
      if (result.ok) {
        setEmbeds(result.embeds);
        setPress(result.press);
        setCanManage(result.canManage);
      } else {
        setLoadError(result.error);
      }
      setLoaded(true);
    });
  }, [active, loaded]);

  return {
    embeds,
    setEmbeds,
    press,
    setPress,
    canManage,
    loaded,
    loadError,
  };
}

// ─── Embeds ──────────────────────────────────────────────────────────────────

export function TalentEmbedsManager({ active }: { active: boolean }) {
  const { embeds, setEmbeds, canManage, loaded, loadError } =
    useProfileExtras(active);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function add() {
    if (!url.trim()) return;
    setMessage(null);
    setState("saving");
    startTransition(async () => {
      const result = await addTalentProfileEmbedAction({
        url: url.trim(),
        title: title.trim() || undefined,
      });
      if (!result.ok) {
        setState("error");
        setMessage(result.error);
        return;
      }
      setEmbeds((current) => [...current, result.embed]);
      setUrl("");
      setTitle("");
      setState("saved");
      setMessage("Added. It shows on your public profile.");
    });
  }

  function remove(id: string) {
    setMessage(null);
    setState("saving");
    startTransition(async () => {
      const result = await removeTalentProfileEmbedAction({ id });
      if (!result.ok) {
        setState("error");
        setMessage(result.error);
        return;
      }
      setEmbeds((current) => current.filter((e) => e.id !== id));
      setState("saved");
    });
  }

  if (!loaded) {
    return (
      <div style={{ fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">
        Loading your embeds…
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={{ fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-red">
        {loadError}
      </div>
    );
  }

  return (
    <div>
      {!canManage ? <UpgradeNotice /> : null}

      {canManage ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${COLORS.borderSoft}`,
            background: "#fff",
          }}
        >
          <FieldRow
            label="Link"
            hint="Instagram post or reel, TikTok video, YouTube, Vimeo, Spotify or SoundCloud."
          >
            <TextInput
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              maxLength={2000}
            />
          </FieldRow>
          <FieldRow label="Caption" optional>
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Behind the scenes, Vogue MX"
              maxLength={160}
            />
          </FieldRow>
          <div style={{ marginTop: 10 }}>
            <PrimaryButton onClick={add} disabled={!url.trim() || state === "saving"}>
              Add embed
            </PrimaryButton>
          </div>
          <StatusLine state={state} message={message} />
        </div>
      ) : null}

      <Divider label={`On your profile (${embeds.length})`} />

      {embeds.length === 0 ? (
        <div style={{ fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">
          Nothing added yet. Paste a link above and it appears on your public
          profile.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {embeds.map((embed) => (
            <div
              key={embed.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
              }}
            >
              <div className="flex-1 min-w-0">
                <div
                  style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500 }}
                  className="text-admin-ink"
                >
                  {embed.title || embed.providerLabel}
                </div>
                <div
                  style={{ fontFamily: FONTS.body, fontSize: 11.5, marginTop: 2 }}
                  className="text-admin-ink-muted truncate"
                >
                  {embed.providerLabel} · {embed.url}
                </div>
              </div>
              <SecondaryButton onClick={() => remove(embed.id)}>Remove</SecondaryButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Press ───────────────────────────────────────────────────────────────────

export function TalentPressManager({ active }: { active: boolean }) {
  const { press, setPress, canManage, loaded, loadError } =
    useProfileExtras(active);
  const [outlet, setOutlet] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [publishedOn, setPublishedOn] = useState("");
  const [quote, setQuote] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function add() {
    if (!outlet.trim() || !title.trim() || !url.trim()) return;
    setMessage(null);
    setState("saving");
    startTransition(async () => {
      const result = await addTalentPressItemAction({
        outlet: outlet.trim(),
        title: title.trim(),
        url: url.trim(),
        publishedOn: publishedOn.trim() || null,
        quote: quote.trim() || null,
      });
      if (!result.ok) {
        setState("error");
        setMessage(result.error);
        return;
      }
      setPress((current) => [...current, result.item]);
      setOutlet("");
      setTitle("");
      setUrl("");
      setPublishedOn("");
      setQuote("");
      setState("saved");
      setMessage("Added. It shows in your press band.");
    });
  }

  function remove(id: string) {
    setMessage(null);
    setState("saving");
    startTransition(async () => {
      const result = await removeTalentPressItemAction({ id });
      if (!result.ok) {
        setState("error");
        setMessage(result.error);
        return;
      }
      setPress((current) => current.filter((p) => p.id !== id));
      setState("saved");
    });
  }

  if (!loaded) {
    return (
      <div style={{ fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">
        Loading your press…
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={{ fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-red">
        {loadError}
      </div>
    );
  }

  return (
    <div>
      {!canManage ? <UpgradeNotice /> : null}

      {canManage ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${COLORS.borderSoft}`,
            background: "#fff",
          }}
        >
          <FieldRow label="Outlet" required>
            <TextInput
              value={outlet}
              onChange={(e) => setOutlet(e.target.value)}
              placeholder="Vogue México"
              maxLength={120}
            />
          </FieldRow>
          <FieldRow label="Headline" required>
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The new faces of Mexico City"
              maxLength={200}
            />
          </FieldRow>
          <FieldRow label="Link" required>
            <TextInput
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://vogue.mx/article/…"
              maxLength={2000}
            />
          </FieldRow>
          <FieldRow label="Published" optional hint="YYYY-MM-DD">
            <TextInput
              type="date"
              value={publishedOn}
              onChange={(e) => setPublishedOn(e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Pull quote" optional>
            <TextInput
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              placeholder="A presence the camera cannot look away from."
              maxLength={500}
            />
          </FieldRow>
          <div style={{ marginTop: 10 }}>
            <PrimaryButton
              onClick={add}
              disabled={
                !outlet.trim() || !title.trim() || !url.trim() || state === "saving"
              }
            >
              Add press item
            </PrimaryButton>
          </div>
          <StatusLine state={state} message={message} />
        </div>
      ) : null}

      <Divider label={`In your press band (${press.length})`} />

      {press.length === 0 ? (
        <div style={{ fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">
          No clippings yet. Add the outlet, the headline and the link.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {press.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
              }}
            >
              <div className="flex-1 min-w-0">
                <div
                  style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500 }}
                  className="text-admin-ink"
                >
                  {item.title}
                </div>
                <div
                  style={{ fontFamily: FONTS.body, fontSize: 11.5, marginTop: 2 }}
                  className="text-admin-ink-muted truncate"
                >
                  {item.outlet}
                  {item.publishedOn ? ` · ${item.publishedOn}` : ""} · {item.url}
                </div>
              </div>
              <SecondaryButton onClick={() => remove(item.id)}>Remove</SecondaryButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
