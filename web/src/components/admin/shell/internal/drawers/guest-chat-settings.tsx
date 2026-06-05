"use client";

// ════════════════════════════════════════════════════════════════════
// GuestChatSettingsDrawer — workspace control for the public guest-chat
// launcher ("Message {…}" floating chat). Mirrors WorkspaceSettingsDrawer
// (light-05): load on open, controlled state, explicit async save state,
// toast + queued router refresh + close. Styled with the shared admin
// tokens (no gold/rust, no black on small components — house rules).
// ════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { logServerError } from "@/lib/server/safe-error";
import {
  loadGuestChatSettingsForAdmin,
  saveGuestChatSettings,
} from "@/lib/server-actions/admin-guest-chat-settings";
import {
  DrawerShell,
  FieldRow,
  Section,
  StandardFooter,
  TextArea,
  ToggleControl,
  useAdminShell,
  useQueuedRouterRefresh,
} from "./drawer-shared";

export function GuestChatSettingsDrawer() {
  const { closeDrawer, toast, tenantSlug } = useAdminShell();
  const queueRouterRefresh = useQueuedRouterRefresh();

  const [enabled, setEnabled] = useState(true);
  const [showOnTalent, setShowOnTalent] = useState(true);
  const [showOnDirectory, setShowOnDirectory] = useState(true);
  const [greeting, setGreeting] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!tenantSlug);

  useEffect(() => {
    if (!tenantSlug) {
      setIsLoading(false);
      return;
    }
    void (async () => {
      try {
        const res = await loadGuestChatSettingsForAdmin();
        if (res.ok) {
          setEnabled(res.data.enabled);
          setShowOnTalent(res.data.showOnTalent);
          setShowOnDirectory(res.data.showOnDirectory);
          setGreeting(res.data.greeting ?? "");
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [tenantSlug]);

  const onSave = async () => {
    if (isSaving || isLoading) return;
    if (!tenantSlug) {
      toast("Settings saved (demo)");
      closeDrawer();
      return;
    }
    setIsSaving(true);
    try {
      const result = await saveGuestChatSettings({
        enabled,
        showOnTalent,
        showOnDirectory,
        greeting: greeting.trim() ? greeting.trim() : null,
      });
      if (!result.ok) {
        toast(result.error || "Couldn't save. Try again.");
        return;
      }
      toast("Guest chat settings saved");
      queueRouterRefresh();
      closeDrawer();
    } catch (err) {
      logServerError("guest-chat-settings.save", err);
      toast("Couldn't save. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const noSurface = enabled && !showOnTalent && !showOnDirectory;

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Guest chat"
      description="A floating “Message” button that lets visitors start a real inquiry from your public pages."
      footer={
        <StandardFooter
          onSave={onSave}
          disabled={isSaving || isLoading}
          saveLabel={isSaving ? "Saving…" : isLoading ? "Loading…" : "Save"}
        />
      }
    >
      <Section title="Status" framed>
        <FieldRow
          label="Enable guest chat"
          hint="When off, the Message button is hidden everywhere on your public site."
        >
          <ToggleControl value={enabled} onChange={setEnabled} label="" />
        </FieldRow>
      </Section>

      {enabled && (
        <Section
          title="Where it appears"
          description="Choose which public surfaces show the launcher."
          framed
        >
          <FieldRow
            label="Talent profile pages"
            hint="The “Message {talent}” button on each individual talent page."
          >
            <ToggleControl value={showOnTalent} onChange={setShowOnTalent} label="" />
          </FieldRow>
          <FieldRow
            label="Directory & home page"
            hint="A “Message {agency}” button on your home and directory pages — starts a general inquiry to your team."
          >
            <ToggleControl
              value={showOnDirectory}
              onChange={setShowOnDirectory}
              label=""
            />
          </FieldRow>

          {noSurface && (
            <p className="rounded-[10px] border border-admin-border px-3 py-2.5 text-[12.5px] leading-relaxed text-admin-ink-muted">
              Guest chat is on, but no surface is selected — pick at least one
              place for it to appear, or turn it off above.
            </p>
          )}
        </Section>
      )}

      {enabled && (
        <Section
          title="Greeting"
          description="Optional. Replaces the default opener guests see when they open the chat."
          framed
        >
          <FieldRow
            label="Custom greeting"
            hint="Leave blank to use the built-in greeting."
            optional
          >
            <TextArea
              value={greeting}
              onChange={(e) => setGreeting(e.currentTarget.value)}
              placeholder="Hi! Tell us about your event and we’ll get the right person to reply."
              rows={3}
            />
          </FieldRow>
        </Section>
      )}
    </DrawerShell>
  );
}
