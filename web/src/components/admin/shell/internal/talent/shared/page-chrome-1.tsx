import { type ReactNode } from "react";
import { CapsLabel, Icon } from "../../primitives";
import { COLORS, FONTS } from "../../state";
import { openGuideArticle } from "@/lib/guide/open-guide";
import { useT } from "@/i18n/use-t";



// ─── Shared header ────────────────────────────────────────────────

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  guideNodeId,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Guide node this page is the parent of — renders the (i) that opens the support drawer on that article. */
  guideNodeId?: string;
}) {
  const t = useT();
  return (
    <>
    <style>{`
      @media (max-width: 680px) {
        [data-tulala-page-header] [data-tulala-h1] {
          font-size: 19px !important; line-height: 1.2 !important; letter-spacing: -0.25px !important; font-weight: 700 !important;
        }
        [data-tulala-page-header] { margin-bottom: 10px !important; gap: 8px !important; align-items: baseline !important; }
        [data-talent-studio-v2="1"] [data-tulala-page-header] {
          margin: -28px -28px 20px !important;
          padding: 18px 28px 16px;
          background: #fff;
          border-bottom: 1px solid rgba(11,11,13,0.08);
        }
        [data-tulala-page-header] [data-tulala-page-eyebrow] { display: none !important; }
        [data-tulala-page-header] p { display: none !important; }
        [data-tulala-page-header-actions] { flex-shrink: 0 !important; }
      }
    `}</style>
    <div data-tulala-page-header style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
      <div className="flex-1 min-w-0">
        {eyebrow && (
          <div data-tulala-page-eyebrow style={{ marginBottom: 6 }}>
            <CapsLabel>{eyebrow}</CapsLabel>
          </div>
        )}
        <div className="flex items-center gap-2">
          <h1
            data-tulala-h1
            {...(guideNodeId ? { "data-guide-id": guideNodeId } : {})}
            style={{
              fontFamily: FONTS.display,
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: -0.4,
              color: COLORS.ink,
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            {title}
          </h1>
          {guideNodeId ? (
            <button
              type="button"
              aria-label={t("dashboard.adminSupport.whatIsThis")}
              title={t("dashboard.adminSupport.whatIsThis")}
              onClick={() => openGuideArticle(guideNodeId)}
              className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-admin-ink-dim hover:text-admin-ink"
            >
              <Icon name="info" size={16} stroke={1.8} color="currentColor" />
            </button>
          ) : null}
        </div>
        {subtitle && (
          <p style={{ fontFamily: FONTS.body, fontSize: 13, margin: "4px 0 0", lineHeight: 1.5, maxWidth: 640 }} className="text-admin-ink-muted">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div data-tulala-page-header-actions style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
    </>
  );
}


export function Grid({ children, cols = "auto" }: { children: ReactNode; cols?: "auto" | "2" | "3" | "4" }) {
  const colMap = {
    auto: "repeat(auto-fit, minmax(280px, 1fr))",
    "2": "repeat(2, 1fr)",
    "3": "repeat(3, 1fr)",
    "4": "repeat(4, 1fr)",
  };
  return (
    <div data-tulala-grid={cols} style={{ display: "grid", gridTemplateColumns: colMap[cols], gap: 12 }}>{children}</div>
  );
}
