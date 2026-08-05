"use client";

import {
  PROFILE_SHELL_SAVE_LOCKED_HINT,
  PROFILE_SHELL_SAVE_REQUIRED_HINT,
  PROFILE_SHELL_UNSAVED_BANNER,
} from "@/lib/talent/profile-shell-save-feedback";
import { useDashboardText } from "../../drawer-shared";

export function ProfileShellUnsavedBanner({ visible }: { visible: boolean }) {
  const copy = useDashboardText();
  if (!visible) return null;
  return (
    <div
      role="status"
      className="mx-4 mb-3 rounded-[10px] border border-admin-amber/20 bg-admin-amber-soft px-3.5 py-2.5 text-admin-13 leading-snug text-admin-ink"
    >
      {copy.t(PROFILE_SHELL_UNSAVED_BANNER)}
    </div>
  );
}

export function ProfileShellSectionSaveHint({
  locked,
  className,
}: {
  locked?: boolean;
  className?: string;
}) {
  const copy = useDashboardText();
  return (
    <p className={className ?? "mb-2.5 text-admin-11h leading-snug text-admin-ink-muted"}>
      {copy.t(locked ? PROFILE_SHELL_SAVE_LOCKED_HINT : PROFILE_SHELL_SAVE_REQUIRED_HINT)}
    </p>
  );
}

export function ProfileShellSaveErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mx-4 mb-3 rounded-[10px] border border-admin-red/30 bg-admin-red/10 px-3.5 py-2.5 text-admin-13 leading-snug text-admin-red"
    >
      {message}
    </div>
  );
}
