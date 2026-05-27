import { PLATFORM_BRAND } from "@/lib/platform/brand";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderWorkspaceWelcomeEmail(args: {
  ownerName: string;
  planTier: string;
  slug: string;
  adminUrl: string;
  publicUrl: string;
}): string {
  const planLabel =
    args.planTier === "free"
      ? "Free"
      : args.planTier.charAt(0).toUpperCase() + args.planTier.slice(1);

  return `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f1ede3;font-family:'Geist',Inter,system-ui,sans-serif;color:#0f1714;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffdf7;border-radius:20px;border:1px solid rgba(15,23,20,0.08);">
    <tr><td style="padding:40px 40px 32px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.26em;text-transform:uppercase;color:#1f4a3a;">Your workspace is ready</div>
      <h1 style="font-family:'Geist',Inter,system-ui,sans-serif;font-size:28px;line-height:1.15;font-weight:500;margin:16px 0 0;color:#0f1714;letter-spacing:-0.025em;">Welcome, ${escapeHtml(
        args.ownerName,
      )}.</h1>
      <p style="margin:20px 0 0;color:#3a4541;font-size:15px;line-height:1.6;">
        Your ${escapeHtml(planLabel)} workspace on ${PLATFORM_BRAND.name} is live.
      </p>
      <ul style="margin:24px 0 0;padding:0;list-style:none;color:#3a4541;font-size:15px;line-height:1.7;">
        <li style="margin:0 0 8px;"><strong style="color:#0f1714;">Public link:</strong> ${escapeHtml(args.publicUrl)}</li>
        <li style="margin:0 0 8px;"><strong style="color:#0f1714;">Admin dashboard:</strong> ${escapeHtml(args.adminUrl)}</li>
        <li style="margin:0;"><strong style="color:#0f1714;">Plan:</strong> ${escapeHtml(planLabel)}</li>
      </ul>
      <p style="margin:28px 0 0;">
        <a href="${escapeHtml(args.adminUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#1f4a3a;color:#fffdf7;font-size:14px;font-weight:600;text-decoration:none;">Open your dashboard</a>
      </p>
      <p style="margin:28px 0 0;color:#3a4541;font-size:14px;line-height:1.6;">
        Next steps: add your first talent, customize your public page, and share your link.
      </p>
      <hr style="border:none;border-top:1px solid rgba(15,23,20,0.08);margin:32px 0;"/>
      <p style="margin:0;color:#6b766f;font-size:13px;line-height:1.6;">— The ${PLATFORM_BRAND.name} team</p>
    </td></tr>
  </table>
</body></html>`;
}
