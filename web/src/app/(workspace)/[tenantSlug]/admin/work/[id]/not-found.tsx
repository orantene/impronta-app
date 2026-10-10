import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export default async function WorkDetailNotFound() {
  const t = createTranslator(await getRequestLocale());
  return (
    <main
      style={{
        padding: "48px 20px",
        maxWidth: 560,
        margin: "0 auto",
        fontFamily: '"Inter", system-ui, sans-serif',
        color: "#0B0B0D",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 22, letterSpacing: 0 }}>{t("admin.work.detail.notFoundTitle")}</h1>
      <p style={{ margin: "10px 0 20px", fontSize: 14, lineHeight: 1.5, color: "rgba(11,11,13,0.55)" }}>
        {t("admin.work.detail.notFoundBody")}
      </p>
      {/* not-found boundaries get no params; "." resolves to the parent /<slug>/admin/work/. */}
      <a
        href="."
        style={{
          height: 36,
          padding: "0 14px",
          borderRadius: 8,
          border: "1px solid rgba(24,24,27,0.08)",
          textDecoration: "none",
          color: "#0B0B0D",
          display: "inline-flex",
          alignItems: "center",
          fontSize: 13,
        }}
      >
        {t("admin.work.detail.backToPipeline")}
      </a>
    </main>
  );
}
