import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { Container } from "../shared/section-primitives";
import {
  loadRegistrationSettings,
  registrationIsLive,
} from "@/lib/saas/registration-settings";
import { OpenTenantRegisterButton } from "@/components/marketing/tenant-register-modal-host";
import type { SectionComponentProps } from "../types";
import type { JoinRegisterV1 } from "./schema";

/**
 * Join / Register block — a portable CTA that opens the tenant-branded
 * registration modal. The modal itself is mounted once per storefront by the
 * layout host; this block just dispatches the open event via
 * OpenTenantRegisterButton.
 *
 * Server component so it can read the workspace's registration settings:
 *   - public + not live  → renders nothing (the workspace is closed/disabled).
 *   - editor preview + not live → a placeholder so the operator understands why
 *     it's blank and where to turn it on.
 *   - live → the branded CTA, label = block override or the global CTA label.
 */
export async function JoinRegisterComponent({
  props,
  tenantId,
  preview,
}: SectionComponentProps<JoinRegisterV1>) {
  const settings = await loadRegistrationSettings(tenantId);
  const live = registrationIsLive(settings);
  const label = props.ctaLabel?.trim() || settings.ctaLabel || "Join the team";
  const align = props.align ?? "center";

  if (!live) {
    if (!preview) return null;
    return (
      <section
        className="site-join-register"
        {...presentationDataAttrs(props.presentation)}
        style={presentationInlineStyles(props.presentation)}
      >
        <Container width="standard">
          <div
            style={{
              border: "1px dashed var(--token-color-line, rgba(0,0,0,0.18))",
              borderRadius: 16,
              padding: "1.5rem",
              textAlign: "center",
              color: "var(--token-color-muted, #6b7280)",
              fontSize: "0.9rem",
            }}
          >
            Registration is off. Turn on “Open for registration” in
            Roster → Registration to activate this block.
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section
      className="site-join-register"
      data-variant={props.variant ?? "card"}
      {...presentationDataAttrs(props.presentation)}
      style={presentationInlineStyles(props.presentation)}
    >
      <Container width="standard">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.9rem",
            alignItems: align === "left" ? "flex-start" : "center",
            textAlign: align === "left" ? "left" : "center",
            padding: props.variant === "inline" ? 0 : "clamp(1.5rem, 4vw, 2.75rem)",
            borderRadius: props.variant === "inline" ? 0 : 20,
            background:
              props.variant === "card"
                ? "var(--token-color-surface-raised, rgba(0,0,0,0.03))"
                : "transparent",
            maxWidth: 640,
            marginInline: align === "left" ? 0 : "auto",
          }}
        >
          {props.eyebrow ? (
            <p
              style={{
                margin: 0,
                fontSize: "0.75rem",
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--token-color-primary, #0F4F3E)",
              }}
            >
              {props.eyebrow}
            </p>
          ) : null}
          {props.headline ? (
            <h2
              style={{
                margin: 0,
                fontSize: "clamp(1.5rem, 3.4vw, 2.1rem)",
                lineHeight: 1.15,
                color: "var(--token-color-ink, #0B0B0D)",
              }}
            >
              {props.headline}
            </h2>
          ) : null}
          {props.copy ? (
            <p
              style={{
                margin: 0,
                fontSize: "1rem",
                lineHeight: 1.5,
                color: "var(--token-color-muted, #4b5563)",
                maxWidth: 480,
              }}
            >
              {props.copy}
            </p>
          ) : null}
          <OpenTenantRegisterButton
            className="site-join-register__cta"
            ariaLabel={label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              marginTop: "0.35rem",
              padding: "0.8rem 1.6rem",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontSize: "0.95rem",
              fontWeight: 600,
              background: "var(--token-color-primary, #0F4F3E)",
              color: "#ffffff",
            }}
          >
            {label}
          </OpenTenantRegisterButton>
        </div>
      </Container>
    </section>
  );
}
