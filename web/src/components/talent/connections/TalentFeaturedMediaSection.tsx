"use client";

import { useEffect, useState, useTransition } from "react";

import {
  addTalentFeaturedMediaAction,
  fetchTalentFeaturedMediaAction,
  removeTalentFeaturedMediaAction,
  updateTalentFeaturedMediaAction,
  type TalentFeaturedMediaItem,
} from "@/lib/talent-integrations/actions";
import {
  Divider,
  PrimaryButton,
  SecondaryButton,
  TextInput,
  Toggle,
} from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";

const PROVIDER_LABEL: Record<string, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  spotify: "Spotify",
  soundcloud: "SoundCloud",
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function TalentFeaturedMediaSection({ active }: { active: boolean }) {
  const [items, setItems] = useState<TalentFeaturedMediaItem[]>([]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!active || loaded) return;
    startTransition(async () => {
      const result = await fetchTalentFeaturedMediaAction();
      if (result.ok) {
        setItems(result.items);
      } else {
        setMessage(result.error);
      }
      setLoaded(true);
    });
  }, [active, loaded]);

  function addItem() {
    if (!url.trim()) return;
    setMessage(null);
    setSaveState("saving");
    startTransition(async () => {
      const result = await addTalentFeaturedMediaAction({
        url: url.trim(),
        title: title.trim() || undefined,
        publicProfileEnabled: false,
      });
      if (!result.ok) {
        setSaveState("error");
        setMessage(result.error);
        return;
      }
      setItems((current) => {
        const without = current.filter((i) => i.id !== result.item.id);
        return [...without, result.item];
      });
      setUrl("");
      setTitle("");
      setSaveState("saved");
      setMessage("Added. It stays private until you turn on public display.");
    });
  }

  function togglePublic(item: TalentFeaturedMediaItem, value: boolean) {
    setMessage(null);
    setSaveState("saving");
    setItems((current) =>
      current.map((i) =>
        i.id === item.id ? { ...i, publicProfileEnabled: value } : i,
      ),
    );
    startTransition(async () => {
      const result = await updateTalentFeaturedMediaAction({
        itemId: item.id,
        publicProfileEnabled: value,
      });
      if (!result.ok) {
        setSaveState("error");
        setMessage(result.error);
        // revert optimistic change
        setItems((current) =>
          current.map((i) =>
            i.id === item.id ? { ...i, publicProfileEnabled: !value } : i,
          ),
        );
        return;
      }
      setItems((current) =>
        current.map((i) => (i.id === result.item.id ? result.item : i)),
      );
      setSaveState("saved");
    });
  }

  function removeItem(item: TalentFeaturedMediaItem) {
    setMessage(null);
    setSaveState("saving");
    startTransition(async () => {
      const result = await removeTalentFeaturedMediaAction({ itemId: item.id });
      if (!result.ok) {
        setSaveState("error");
        setMessage(result.error);
        return;
      }
      setItems((current) => current.filter((i) => i.id !== item.id));
      setSaveState("saved");
    });
  }

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Saved"
        : saveState === "error"
          ? "Couldn't save"
          : "";

  return (
    <div style={{ marginTop: 18 }}>
      <Divider label="Featured media" />
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${COLORS.borderSoft}`,
          background: COLORS.surfaceAlt,
          fontFamily: FONTS.body,
          fontSize: 12,
          lineHeight: 1.55,
          color: COLORS.inkMuted,
          marginBottom: 12,
        }}
      >
        Paste a public YouTube, Vimeo, Spotify, or SoundCloud link to showcase it
        on your public profile. Each item stays private until you switch it on.
        Featured media is <strong>showcase only</strong> — it is not a verified
        badge.
      </div>

      <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
        <TextInput
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=…"
        />
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
        />
        <PrimaryButton
          onClick={addItem}
          disabled={isPending || !url.trim()}
        >
          {isPending && saveState === "saving" ? "Saving…" : "Add media"}
        </PrimaryButton>
      </div>

      {items.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${COLORS.borderSoft}`,
                background: "#fff",
                fontFamily: FONTS.body,
              }}
            >
              <div className="flex-1 min-w-0">
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: COLORS.ink,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.title || item.url || item.id}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                  {PROVIDER_LABEL[item.provider] ?? item.provider} · {item.itemKind} ·{" "}
                  {item.publicProfileEnabled ? "Public" : "Private"}
                </div>
              </div>
              <Toggle
                on={item.publicProfileEnabled}
                onChange={(value) => togglePublic(item, value)}
                label="Show on public profile"
              />
              <SecondaryButton onClick={() => removeItem(item)}>
                Remove
              </SecondaryButton>
            </div>
          ))}
        </div>
      ) : loaded ? (
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 12,
            color: COLORS.inkMuted,
          }}
        >
          No featured media yet.
        </div>
      ) : null}

      {saveLabel || message ? (
        <div
          style={{
            marginTop: 12,
            fontFamily: FONTS.body,
            fontSize: 12,
            color:
              saveState === "error" ? COLORS.criticalDeep : COLORS.inkMuted,
          }}
        >
          {[saveLabel, message].filter(Boolean).join(" · ")}
        </div>
      ) : null}
    </div>
  );
}
