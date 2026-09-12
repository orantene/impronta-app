"use client";

import { useState, useTransition } from "react";

import { useT } from "@/i18n/use-t";
import { updatePlatformMessagingChannels } from "@/lib/server-actions/admin-platform-messaging-channels";

/** EXPERIMENTAL. Delete this file with the WhatsApp drawer. */
export function PlatformMessagingChannelsCard({ current }: { current: boolean }) {
  const t = useT();
  const [enabled, setEnabled] = useState(current);
  const [pending, start] = useTransition();
  const dirty = enabled !== current;
  return (
    <div data-testid="platform-messaging-channels-card">
      <label className="flex items-start gap-2.5 text-[13px]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="block font-semibold">{t("dashboard.channels.hq.label")}</span>
          <span className="block text-[12px] text-admin-ink-muted">{t("dashboard.channels.hq.hint")}</span>
        </span>
      </label>
      <button
        type="button"
        disabled={!dirty || pending}
        onClick={() => start(async () => { await updatePlatformMessagingChannels({ enabled }); })}
        className="mt-3 h-9 rounded-[8px] bg-admin-ink px-4 text-[13px] font-semibold text-white disabled:opacity-40"
      >
        {pending ? t("dashboard.platform.settings.saving") : t("dashboard.platform.settings.save")}
      </button>
    </div>
  );
}
