import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { ContactFormV1 } from "./schema";

export function ContactFormComponent({ props }: SectionComponentProps<ContactFormV1>) {
  const {
    eyebrow,
    headline,
    intro,
    fields,
    submitLabel,
    action,
    method,
    honeypot,
    variant,
    presentation,
  } = props;

  return (
    <section
      className="site-form"
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-form__inner">
        {(eyebrow || headline || intro) && (
          <header className="site-form__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-form__headline">{renderInlineRich(headline)}</h2>
            ) : null}
            {intro ? <p className="site-form__intro">{intro}</p> : null}
          </header>
        )}

        <form className="site-form__form" action={action} method={method}>
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

          <button type="submit" className="site-btn site-btn--primary site-form__submit">
            {submitLabel}
          </button>
        </form>
      </div>
    </section>
  );
}
