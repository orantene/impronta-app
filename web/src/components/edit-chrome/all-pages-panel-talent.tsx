"use client";

/**
 * Pages list body for a TALENT site. A talent site is one page that lives on
 * the talent surface, not in a workspace's `cms_pages`, so the workspace
 * actions (list / add / AI-create) never apply and used to answer "No
 * workspace." Here the panel lists the page being edited and offers its
 * history, with no workspace errors.
 */
import { DockFloatingPanel } from "./dock-floating-panel";
import { CHROME } from "./kit/tokens";
import { useEditorLocale } from "./use-editor-locale";

export function TalentAllPagesPanel({
  open,
  onClose,
  onHistory,
}: {
  open: boolean;
  onClose: () => void;
  onHistory: () => void;
}) {
  const { t } = useEditorLocale();
  return (
    <DockFloatingPanel
      panelId="all-pages"
      title={t("All pages")}
      open={open}
      onClose={onClose}
      width={320}
      testId="all-pages-panel"
    >
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[10px] py-[10px]">
      <button
        type="button"
        onClick={() => {
          onClose();
          onHistory();
        }}
        className="mb-[10px] flex w-full cursor-pointer items-center gap-[8px] rounded-[10px] border-none px-[10px] py-[8px] text-left text-[12px]"
        style={{ background: "transparent", color: CHROME.muted }}
      >
        {t("Page history & revisions")}
      </button>
      <div
        data-testid="talent-pages-row"
        className="mb-[4px] flex items-center gap-[8px] rounded-[10px] px-[10px] py-[9px]"
        style={{ background: "rgba(124,58,237,0.08)" }}
      >
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium" style={{ color: CHROME.ink }}>
          {t("Your site")}
          <span className="ml-[6px] text-[10px] font-semibold uppercase tracking-wide" style={{ color: CHROME.muted }}>
            {t("Home")}
          </span>
        </span>
        <span className="shrink-0 text-[11px]" style={{ color: CHROME.muted }}>
          {t("Editing now")}
        </span>
      </div>
    </div>
    </DockFloatingPanel>
  );
}
