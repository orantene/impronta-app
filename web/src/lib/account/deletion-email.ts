import { PLATFORM_BRAND } from "@/lib/platform/brand";

/**
 * Account-deletion confirmation emails: one when a deletion is requested, one
 * when it is completed. Pure render + a best-effort sender. Sending never
 * throws and never blocks the deletion flow; a failed or skipped send is
 * swallowed (the deletion itself is the source of truth).
 *
 * Locale "both" is used when the recipient's language is unknown (the cron
 * has no request): the body carries English and Spanish one after the other.
 * Spanish is Mexican "tú". No em dashes.
 */

export type DeletionEmailKind = "requested" | "completed";
export type DeletionEmailLocale = "en" | "es" | "both";

type Block = { subject: string; heading: string; paras: string[] };

function requestedCopy(l: "en" | "es", date: string | null): Block {
  if (l === "es") {
    return {
      subject: "Recibimos tu solicitud para eliminar tu cuenta",
      heading: "Tu cuenta está programada para eliminarse",
      paras: [
        date
          ? `No se elimina nada hasta el ${date}. Puedes cancelar en cualquier momento antes de esa fecha desde la configuración de tu cuenta.`
          : "No se elimina nada durante 14 días. Puedes cancelar en cualquier momento antes de eso desde la configuración de tu cuenta.",
        "Si no fuiste tú, entra a tu cuenta y cancela la eliminación, o respóndenos a este correo.",
      ],
    };
  }
  return {
    subject: "We received your request to delete your account",
    heading: "Your account is scheduled for deletion",
    paras: [
      date
        ? `Nothing is deleted until ${date}. You can cancel any time before then from your account settings.`
        : "Nothing is deleted for 14 days. You can cancel any time before then from your account settings.",
      "If this was not you, sign in and cancel the deletion, or reply to this email.",
    ],
  };
}

function completedCopy(l: "en" | "es"): Block {
  if (l === "es") {
    return {
      subject: "Tu cuenta fue eliminada",
      heading: "Tu cuenta fue eliminada",
      paras: [
        "Quitamos tu nombre, fotos, datos de contacto y perfil, y ya no puedes iniciar sesión.",
        "Los registros de reservas y pagos se conservan por 5 años sin tu nombre ni tus datos de contacto, porque la ley nos obliga a guardarlos.",
      ],
    };
  }
  return {
    subject: "Your account has been deleted",
    heading: "Your account has been deleted",
    paras: [
      "We removed your name, photos, contact details and profile, and you can no longer sign in.",
      "Booking and payment records are kept for 5 years with your name and contact details removed, because the law requires us to keep them.",
    ],
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(iso: string | null | undefined, l: "en" | "es"): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(l === "es" ? "es-MX" : "en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export function renderDeletionEmail(
  kind: DeletionEmailKind,
  input: { locale: DeletionEmailLocale; scheduledFor?: string | null },
): { subject: string; html: string } {
  const langs: Array<"en" | "es"> = input.locale === "both" ? ["en", "es"] : [input.locale];
  const blocks = langs.map((l) =>
    kind === "requested" ? requestedCopy(l, formatDate(input.scheduledFor, l)) : completedCopy(l),
  );
  const subject = blocks.map((b) => b.subject).join(" / ");
  const body = blocks
    .map(
      (b) =>
        `<h1 style="font-size:20px;line-height:1.3;margin:0 0 12px;">${esc(b.heading)}</h1>` +
        b.paras.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${esc(p)}</p>`).join(""),
    )
    .join('<hr style="border:none;border-top:1px solid #e5e2da;margin:24px 0;"/>');
  const html = `<!doctype html><html lang="${langs[0]}"><body style="margin:0;padding:32px 16px;background:#f6f4ee;font-family:Inter,system-ui,sans-serif;color:#0f1714;"><div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;">${body}<p style="margin:24px 0 0;font-size:13px;color:#6b766f;">${esc(PLATFORM_BRAND.name)}</p></div></body></html>`;
  return { subject, html };
}

export type DeletionEmailSender = (msg: { to: string; subject: string; html: string }) => Promise<unknown>;

/** Best effort. Resolves true when a send was attempted without throwing. */
export async function sendDeletionEmail(
  kind: DeletionEmailKind,
  input: { to: string | null | undefined; locale: DeletionEmailLocale; scheduledFor?: string | null },
  send?: DeletionEmailSender,
): Promise<boolean> {
  try {
    if (!input.to) return false;
    const { subject, html } = renderDeletionEmail(kind, input);
    const sender =
      send ?? (async (m) => (await import("@/lib/email")).sendEmail({ to: m.to, subject: m.subject, html: m.html }));
    await sender({ to: input.to, subject, html });
    return true;
  } catch {
    return false;
  }
}
