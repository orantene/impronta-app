import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { ContactFormV1 } from "./schema";
import {
  buttonSize,
  ctaDecls,
  ctaJustifyContent,
  eyebrowSize,
  headingSize,
  paragraphSize,
  sectionHeadAlignDecls,
  textAlignFor,
  textNodeDecls,
  textToneColor,
  toCssDecls,
  visibilityDisplay,
} from "./style-helpers";

export function ContactFormComponent({
  props,
  sectionId,
  captcha: resolvedCaptcha,
  builderNodeBindings,
}: SectionComponentProps<ContactFormV1>) {
  const {
    eyebrow,
    headline,
    intro,
    fields,
    submitLabel,
    action,
    method,
    honeypot,
    successMessage,
    variant,
    captcha,
    nodePresentation,
    presentation,
  } = props;
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;
  const eyebrowNode = nodePresentation?.subheadline;
  const headlineNode = nodePresentation?.headline;
  const copyNode = nodePresentation?.copy;
  const primaryCtaNode = nodePresentation?.primaryCta;
  const responsiveCss = buildNodePresentationResponsiveCss({
    sectionId,
    rules: [
      {
        selector: ".site-prim-head",
        tablet: sectionHeadAlignDecls(
          headlineNode?.breakpoints?.tablet?.align ??
            eyebrowNode?.breakpoints?.tablet?.align ??
            copyNode?.breakpoints?.tablet?.align,
        ),
        mobile: sectionHeadAlignDecls(
          headlineNode?.breakpoints?.mobile?.align ??
            eyebrowNode?.breakpoints?.mobile?.align ??
            copyNode?.breakpoints?.mobile?.align,
        ),
      },
      {
        selector: ".site-eyebrow > span",
        tablet: textNodeDecls(eyebrowNode?.breakpoints?.tablet, eyebrowSize),
        mobile: textNodeDecls(eyebrowNode?.breakpoints?.mobile, eyebrowSize),
      },
      {
        selector: ".site-prim-head__headline > span",
        tablet: textNodeDecls(headlineNode?.breakpoints?.tablet, headingSize),
        mobile: textNodeDecls(headlineNode?.breakpoints?.mobile, headingSize),
      },
      {
        selector: ".site-prim-head__intro > span",
        tablet: textNodeDecls(copyNode?.breakpoints?.tablet, paragraphSize),
        mobile: textNodeDecls(copyNode?.breakpoints?.mobile, paragraphSize),
      },
      {
        selector: ".site-form__actions",
        tablet: toCssDecls({
          justifyContent: ctaJustifyContent(primaryCtaNode?.breakpoints?.tablet?.align),
        }),
        mobile: toCssDecls({
          justifyContent: ctaJustifyContent(primaryCtaNode?.breakpoints?.mobile?.align),
        }),
      },
      {
        selector: ".site-form__submit",
        tablet: ctaDecls(primaryCtaNode?.breakpoints?.tablet),
        mobile: ctaDecls(primaryCtaNode?.breakpoints?.mobile),
      },
    ],
  });

  // Captcha widget. The operator opts into a provider on the section
  // (`captcha`); the actual provider + PUBLIC site key are server-resolved per
  // tenant (their own captcha integration first, else the platform fallback)
  // and threaded in via `resolvedCaptcha`. Env vars are a last-resort fallback
  // for legacy/standalone renders where the resolver didn't run.
  const tenantProvider =
    resolvedCaptcha && resolvedCaptcha.provider !== "none"
      ? resolvedCaptcha.provider
      : null;
  const tenantSiteKey = resolvedCaptcha?.siteKey ?? null;
  const hcaptchaKey =
    (tenantProvider === "hcaptcha" ? tenantSiteKey : null) ??
    process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;
  const turnstileKey =
    (tenantProvider === "turnstile" ? tenantSiteKey : null) ??
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const captchaActive =
    (captcha === "hcaptcha" && hcaptchaKey) ||
    (captcha === "turnstile" && turnstileKey);

  // Phase 8 — when the operator picks `internal:auto` (or just leaves
  // the action blank with a non-null sectionId), route the form to
  // Tulala's own /api/cms/forms/submit endpoint and inject the
  // section-id + honeypot-name as hidden fields the API requires.
  const useInternal =
    sectionId &&
    (action.trim() === "internal" ||
      action.trim() === "internal:auto" ||
      action.trim().startsWith("internal:"));
  const formAction = useInternal ? "/api/cms/forms/submit" : action;
  const formMethod = useInternal ? "POST" : method;

  return (
    <section
      className="site-form"
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      ) : null}
      <Container width="standard">
        {(eyebrow || headline || intro) && (
          <SectionHead
            align={headlineNode?.align === "left" ? "start" : "center"}
            eyebrow={
              eyebrow ? (
                <span
                  style={{
                    display: visibilityDisplay(eyebrowNode?.visibility) ?? "inline-block",
                    textAlign: textAlignFor(eyebrowNode?.align),
                    maxWidth: eyebrowNode?.maxWidthPx
                      ? `${eyebrowNode.maxWidthPx}px`
                      : undefined,
                    marginTop:
                      typeof eyebrowNode?.marginTopPx === "number"
                        ? `${eyebrowNode.marginTopPx}px`
                        : undefined,
                    marginBottom:
                      typeof eyebrowNode?.marginBottomPx === "number"
                        ? `${eyebrowNode.marginBottomPx}px`
                        : undefined,
                    marginInline:
                      typeof eyebrowNode?.marginLeftPx !== "number" &&
                      typeof eyebrowNode?.marginRightPx !== "number" &&
                      typeof eyebrowNode?.marginInlinePx === "number"
                        ? `${eyebrowNode.marginInlinePx}px`
                        : undefined,
                    marginLeft:
                      typeof eyebrowNode?.marginLeftPx === "number"
                        ? `${eyebrowNode.marginLeftPx}px`
                        : undefined,
                    marginRight:
                      typeof eyebrowNode?.marginRightPx === "number"
                        ? `${eyebrowNode.marginRightPx}px`
                        : undefined,
                    paddingTop:
                      typeof eyebrowNode?.paddingTopPx === "number"
                        ? `${eyebrowNode.paddingTopPx}px`
                        : undefined,
                    paddingBottom:
                      typeof eyebrowNode?.paddingBottomPx === "number"
                        ? `${eyebrowNode.paddingBottomPx}px`
                        : undefined,
                    paddingInline:
                      typeof eyebrowNode?.paddingLeftPx !== "number" &&
                      typeof eyebrowNode?.paddingRightPx !== "number" &&
                      typeof eyebrowNode?.paddingInlinePx === "number"
                        ? `${eyebrowNode.paddingInlinePx}px`
                        : undefined,
                    paddingLeft:
                      typeof eyebrowNode?.paddingLeftPx === "number"
                        ? `${eyebrowNode.paddingLeftPx}px`
                        : undefined,
                    paddingRight:
                      typeof eyebrowNode?.paddingRightPx === "number"
                        ? `${eyebrowNode.paddingRightPx}px`
                        : undefined,
                    fontSize: eyebrowSize(eyebrowNode?.size),
                    color: textToneColor(eyebrowNode?.tone),
                  }}
                >
                  {renderInlineRich(eyebrow)}
                </span>
              ) : undefined
            }
            headline={
              headline ? (
                <span
                  style={{
                    display: visibilityDisplay(headlineNode?.visibility) ?? "inline-block",
                    textAlign: textAlignFor(headlineNode?.align),
                    maxWidth: headlineNode?.maxWidthPx
                      ? `${headlineNode.maxWidthPx}px`
                      : undefined,
                    marginTop:
                      typeof headlineNode?.marginTopPx === "number"
                        ? `${headlineNode.marginTopPx}px`
                        : undefined,
                    marginBottom:
                      typeof headlineNode?.marginBottomPx === "number"
                        ? `${headlineNode.marginBottomPx}px`
                        : undefined,
                    marginInline:
                      typeof headlineNode?.marginLeftPx !== "number" &&
                      typeof headlineNode?.marginRightPx !== "number" &&
                      typeof headlineNode?.marginInlinePx === "number"
                        ? `${headlineNode.marginInlinePx}px`
                        : undefined,
                    marginLeft:
                      typeof headlineNode?.marginLeftPx === "number"
                        ? `${headlineNode.marginLeftPx}px`
                        : undefined,
                    marginRight:
                      typeof headlineNode?.marginRightPx === "number"
                        ? `${headlineNode.marginRightPx}px`
                        : undefined,
                    paddingTop:
                      typeof headlineNode?.paddingTopPx === "number"
                        ? `${headlineNode.paddingTopPx}px`
                        : undefined,
                    paddingBottom:
                      typeof headlineNode?.paddingBottomPx === "number"
                        ? `${headlineNode.paddingBottomPx}px`
                        : undefined,
                    paddingInline:
                      typeof headlineNode?.paddingLeftPx !== "number" &&
                      typeof headlineNode?.paddingRightPx !== "number" &&
                      typeof headlineNode?.paddingInlinePx === "number"
                        ? `${headlineNode.paddingInlinePx}px`
                        : undefined,
                    paddingLeft:
                      typeof headlineNode?.paddingLeftPx === "number"
                        ? `${headlineNode.paddingLeftPx}px`
                        : undefined,
                    paddingRight:
                      typeof headlineNode?.paddingRightPx === "number"
                        ? `${headlineNode.paddingRightPx}px`
                        : undefined,
                    fontSize: headingSize(headlineNode?.size),
                    color: textToneColor(headlineNode?.tone),
                  }}
                >
                  {renderInlineRich(headline)}
                </span>
              ) : undefined
            }
            intro={
              intro ? (
                <span
                  style={{
                    display: visibilityDisplay(copyNode?.visibility) ?? "inline-block",
                    textAlign: textAlignFor(copyNode?.align),
                    maxWidth: copyNode?.maxWidthPx
                      ? `${copyNode.maxWidthPx}px`
                      : undefined,
                    marginTop:
                      typeof copyNode?.marginTopPx === "number"
                        ? `${copyNode.marginTopPx}px`
                        : undefined,
                    marginBottom:
                      typeof copyNode?.marginBottomPx === "number"
                        ? `${copyNode.marginBottomPx}px`
                        : undefined,
                    marginInline:
                      typeof copyNode?.marginLeftPx !== "number" &&
                      typeof copyNode?.marginRightPx !== "number" &&
                      typeof copyNode?.marginInlinePx === "number"
                        ? `${copyNode.marginInlinePx}px`
                        : undefined,
                    marginLeft:
                      typeof copyNode?.marginLeftPx === "number"
                        ? `${copyNode.marginLeftPx}px`
                        : undefined,
                    marginRight:
                      typeof copyNode?.marginRightPx === "number"
                        ? `${copyNode.marginRightPx}px`
                        : undefined,
                    paddingTop:
                      typeof copyNode?.paddingTopPx === "number"
                        ? `${copyNode.paddingTopPx}px`
                        : undefined,
                    paddingBottom:
                      typeof copyNode?.paddingBottomPx === "number"
                        ? `${copyNode.paddingBottomPx}px`
                        : undefined,
                    paddingInline:
                      typeof copyNode?.paddingLeftPx !== "number" &&
                      typeof copyNode?.paddingRightPx !== "number" &&
                      typeof copyNode?.paddingInlinePx === "number"
                        ? `${copyNode.paddingInlinePx}px`
                        : undefined,
                    paddingLeft:
                      typeof copyNode?.paddingLeftPx === "number"
                        ? `${copyNode.paddingLeftPx}px`
                        : undefined,
                    paddingRight:
                      typeof copyNode?.paddingRightPx === "number"
                        ? `${copyNode.paddingRightPx}px`
                        : undefined,
                    fontSize: paragraphSize(copyNode?.size),
                    color: textToneColor(copyNode?.tone),
                  }}
                >
                  {renderInlineRich(intro)}
                </span>
              ) : undefined
            }
            eyebrowBuilderNodeId={nodeIdsByRole?.subheadline}
            headlineBuilderNodeId={nodeIdsByRole?.headline}
            introBuilderNodeId={nodeIdsByRole?.copy}
          />
        )}

        <form className="site-form__form" action={formAction} method={formMethod}>
          {useInternal && sectionId ? (
            <>
              <input type="hidden" name="__tulala_section" value={sectionId} />
              <input type="hidden" name="__tulala_honeypot" value={honeypot} />
            </>
          ) : null}

          {/* Spam honeypot — hidden field bots fill out; legitimate users don't. */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: "-10000px",
              top: "auto",
              width: "1px",
              height: "1px",
              overflow: "hidden",
            }}
          >
            <label>
              {honeypot}
              <input type="text" name={honeypot} tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          {fields.map((f, i) => {
            const id = `site-form-${f.name}-${i}`;
            const opts = (f.options ?? "")
              .split("\n")
              .map((s) => s.trim())
              .filter((s) => s);
            return (
              <div
                className={
                  f.type === "consent" || f.type === "checkbox"
                    ? "site-form__field site-form__field--check"
                    : "site-form__field"
                }
                key={id}
              >
                {/* ── consent / checkbox: label wraps the input ──────────── */}
                {f.type === "consent" ? (
                  <label htmlFor={id} className="site-form__label site-form__label--consent">
                    <input
                      id={id}
                      name={f.name}
                      type="checkbox"
                      required
                      className="site-form__checkbox"
                    />
                    <span>
                      {f.consentText ?? f.label}
                      {/* consent is always required — no optional star */}
                    </span>
                  </label>
                ) : f.type === "checkbox" ? (
                  <label htmlFor={id} className="site-form__label site-form__label--check">
                    <input
                      id={id}
                      name={f.name}
                      type="checkbox"
                      required={f.required}
                      className="site-form__checkbox"
                    />
                    <span>
                      {f.label}
                      {f.required ? (
                        <span aria-hidden className="site-form__required">
                          *
                        </span>
                      ) : null}
                    </span>
                  </label>
                ) : (
                  /* ── all other types: separate label + control ─────────── */
                  <>
                    <label htmlFor={id} className="site-form__label">
                      {f.label}
                      {f.required ? (
                        <span aria-hidden className="site-form__required">
                          *
                        </span>
                      ) : null}
                    </label>
                    {f.type === "textarea" ? (
                      <textarea
                        id={id}
                        name={f.name}
                        required={f.required}
                        placeholder={f.placeholder}
                        rows={4}
                        className="site-form__input"
                      />
                    ) : f.type === "select" ? (
                      <select
                        id={id}
                        name={f.name}
                        required={f.required}
                        className="site-form__input"
                        defaultValue=""
                      >
                        <option value="" disabled>
                          {f.placeholder ?? "Choose…"}
                        </option>
                        {opts.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : f.type === "file" ? (
                      /* FORMS-1 — file input (URL/metadata capture only;
                         no binary upload on Supabase free tier).
                         Client size guard: the inline script below enforces
                         fileMaxSizeMb before submit. */
                      <>
                        <input
                          id={id}
                          name={f.name}
                          type="file"
                          required={f.required}
                          accept={f.fileAccept ?? undefined}
                          className="site-form__input site-form__input--file"
                          data-max-size-mb={f.fileMaxSizeMb ?? 5}
                        />
                        <script
                          dangerouslySetInnerHTML={{
                            __html: `(function(){var el=document.getElementById(${JSON.stringify(id)});if(!el)return;el.addEventListener('change',function(){var maxMb=parseFloat(el.getAttribute('data-max-size-mb')||'5');var f=el.files&&el.files[0];if(f&&f.size>maxMb*1024*1024){alert('File is too large. Maximum size is '+maxMb+' MB.');el.value='';}});})();`,
                          }}
                        />
                      </>
                    ) : f.type === "number" ? (
                      /* FORMS-1 — number input with optional min/max bounds */
                      <input
                        id={id}
                        name={f.name}
                        type="number"
                        required={f.required}
                        placeholder={f.placeholder}
                        min={typeof f.numberMin === "number" ? f.numberMin : undefined}
                        max={typeof f.numberMax === "number" ? f.numberMax : undefined}
                        className="site-form__input"
                      />
                    ) : (
                      /* text / email / tel / date — native input type pass-through */
                      <input
                        id={id}
                        name={f.name}
                        type={f.type}
                        required={f.required}
                        placeholder={f.placeholder}
                        className="site-form__input"
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}

          {captchaActive && captcha === "hcaptcha" ? (
            <>
              <div
                className="h-captcha"
                data-sitekey={hcaptchaKey}
                data-callback="__tulalaCaptchaDone"
              />
              <script src="https://js.hcaptcha.com/1/api.js" async defer />
            </>
          ) : null}
          {captchaActive && captcha === "turnstile" ? (
            <>
              <div className="cf-turnstile" data-sitekey={turnstileKey} />
              <script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                async
                defer
              />
            </>
          ) : null}

          <div
            className="site-form__actions"
            style={{
              display: "flex",
              justifyContent: ctaJustifyContent(primaryCtaNode?.align),
            }}
          >
            <button
              type="submit"
              className="site-btn site-btn--primary site-form__submit"
              data-builder-node-id={nodeIdsByRole?.primaryCta}
              style={{
                ...buttonSize(primaryCtaNode?.size),
                marginTop:
                  typeof primaryCtaNode?.marginTopPx === "number"
                    ? `${primaryCtaNode.marginTopPx}px`
                    : undefined,
                marginBottom:
                  typeof primaryCtaNode?.marginBottomPx === "number"
                    ? `${primaryCtaNode.marginBottomPx}px`
                    : undefined,
                marginInline:
                  typeof primaryCtaNode?.marginLeftPx !== "number" &&
                  typeof primaryCtaNode?.marginRightPx !== "number" &&
                  typeof primaryCtaNode?.marginInlinePx === "number"
                    ? `${primaryCtaNode.marginInlinePx}px`
                    : undefined,
                marginLeft:
                  typeof primaryCtaNode?.marginLeftPx === "number"
                    ? `${primaryCtaNode.marginLeftPx}px`
                    : undefined,
                marginRight:
                  typeof primaryCtaNode?.marginRightPx === "number"
                    ? `${primaryCtaNode.marginRightPx}px`
                    : undefined,
                paddingTop:
                  typeof primaryCtaNode?.paddingTopPx === "number"
                    ? `${primaryCtaNode.paddingTopPx}px`
                    : undefined,
                paddingBottom:
                  typeof primaryCtaNode?.paddingBottomPx === "number"
                    ? `${primaryCtaNode.paddingBottomPx}px`
                    : undefined,
                paddingInline:
                  typeof primaryCtaNode?.paddingLeftPx !== "number" &&
                  typeof primaryCtaNode?.paddingRightPx !== "number" &&
                  typeof primaryCtaNode?.paddingInlinePx === "number"
                    ? `${primaryCtaNode.paddingInlinePx}px`
                    : undefined,
                paddingLeft:
                  typeof primaryCtaNode?.paddingLeftPx === "number"
                    ? `${primaryCtaNode.paddingLeftPx}px`
                    : undefined,
                paddingRight:
                  typeof primaryCtaNode?.paddingRightPx === "number"
                    ? `${primaryCtaNode.paddingRightPx}px`
                    : undefined,
                display: visibilityDisplay(primaryCtaNode?.visibility),
              }}
            >
              {submitLabel}
            </button>
          </div>
        </form>
        {/* Inline success banner — shown when the URL has the
            ?__tulala_form=ok flag the API redirects with. CSS-only via
            :has() and :target-like trick (querystring isn't a state
            CSS can read directly, so we use a tiny inline script). */}
        {useInternal ? (
          <p className="site-form__success" data-success-msg hidden>
            {successMessage}
          </p>
        ) : null}
        {useInternal ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){var u=new URL(window.location.href);if(u.searchParams.get('__tulala_form')==='ok'){var els=document.querySelectorAll('[data-success-msg]');for(var i=0;i<els.length;i++){els[i].hidden=false;}}})();`,
            }}
          />
        ) : null}
      </Container>
    </section>
  );
}
