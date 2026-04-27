import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { ContactFormV1 } from "./schema";

export function ContactFormComponent({
  props,
  sectionId,
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
    presentation,
  } = props;

  // Phase 8 — captcha widget (env-driven site keys; absent env = no widget).
  const hcaptchaKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;
  const turnstileKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
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
      <Container width="standard">
        {(eyebrow || headline || intro) && (
          <SectionHead
          align="center"
          eyebrow={eyebrow}
          headline={headline ? renderInlineRich(headline) : undefined}
          intro={intro}
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
              <div className="site-form__field" key={id}>
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
                ) : (
                  <input
                    id={id}
                    name={f.name}
                    type={f.type}
                    required={f.required}
                    placeholder={f.placeholder}
                    className="site-form__input"
                  />
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
              {/* eslint-disable-next-line @next/next/no-sync-scripts */}
              <script src="https://js.hcaptcha.com/1/api.js" async defer />
            </>
          ) : null}
          {captchaActive && captcha === "turnstile" ? (
            <>
              <div className="cf-turnstile" data-sitekey={turnstileKey} />
              {/* eslint-disable-next-line @next/next/no-sync-scripts */}
              <script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                async
                defer
              />
            </>
          ) : null}

          <button type="submit" className="site-btn site-btn--primary site-form__submit">
            {submitLabel}
          </button>
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
