"use client";

/**
 * "Follows your profile" switch for a heading or paragraph whose words come
 * from the talent's profile at render time (`props.liveText`, see
 * `lib/site-admin/builder-node/live-text-keys.ts`). On: the page shows the
 * profile value and the text below is only the fallback. Off: the node keeps
 * the words as written and the profile no longer changes it. Typing new text
 * turns it off as well (`patchBuilderNodeProps`).
 */
import type { LiveTextKey } from "@/lib/site-admin/builder-node/live-text-keys";

import { KIT } from "./kit/tokens";
import { useInspectorT } from "./kit/use-inspector-t";

type CommitPatch = (patch: Record<string, unknown>) => void;

export function LiveTextToggle({
  liveText,
  commitPatch,
}: {
  liveText: LiveTextKey | undefined;
  commitPatch: CommitPatch;
}) {
  const { t } = useInspectorT();
  if (!liveText) return null;
  return (
    <div className={KIT.field}>
      <label className="flex items-start gap-2 text-[13px] text-stone-800">
        <input
          type="checkbox"
          className="mt-0.5"
          checked
          onChange={(e) => {
            if (!e.target.checked) commitPatch({ liveText: undefined });
          }}
        />
        <span>
          {t("Follows your profile")}
          <span className="mt-0.5 block text-[12px] text-stone-500">
            {t(
              "This line is filled in from your profile and stays up to date. Turn it off, or type your own words, to keep it as written.",
            )}
          </span>
        </span>
      </label>
    </div>
  );
}
