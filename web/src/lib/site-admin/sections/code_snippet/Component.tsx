/**
 * Phase E (Final Batch 3) — head-only migration.
 * SectionHead replaces the bespoke site-snippet__head / site-snippet__headline
 * pattern, unifying eyebrow + h2 rhythm. The line-number renderer, copy
 * button, and inline dangerouslySetInnerHTML script are preserved exactly.
 */
import { SectionHead } from "../shared/section-primitives";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { CodeSnippetV1 } from "./schema";

export function CodeSnippetComponent({ props }: SectionComponentProps<CodeSnippetV1>) {
  const { eyebrow, headline, filename, language, code, showLineNumbers, showCopyButton, variant, presentation } = props;
  const lines = code.split("\n");
  return (
    <section
      className="site-snippet"
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-snippet__inner">
        {(eyebrow || headline) && (
          <SectionHead
            align="center"
            eyebrow={eyebrow}
            headline={headline ? renderInlineRich(headline) : undefined}
          />
        )}
        <div className="site-snippet__frame">
          {(filename || showCopyButton) && (
            <div className="site-snippet__bar">
              <span className="site-snippet__filename">
                {filename ? `${filename}` : null}
                {filename && language ? <span className="site-snippet__lang"> · {language}</span> : null}
                {!filename && language ? <span className="site-snippet__lang">{language}</span> : null}
              </span>
              {showCopyButton ? (
                <button
                  type="button"
                  className="site-snippet__copy"
                  data-snippet-copy
                  aria-label="Copy code"
                >
                  Copy
                </button>
              ) : null}
            </div>
          )}
          <pre className="site-snippet__pre">
            <code className="site-snippet__code" data-snippet-code>
              {showLineNumbers
                ? lines.map((l, i) => (
                    <span key={i} className="site-snippet__line">
                      <span aria-hidden className="site-snippet__lineno">
                        {i + 1}
                      </span>
                      {l}
                      {"\n"}
                    </span>
                  ))
                : code}
            </code>
          </pre>
        </div>
      </div>
      {showCopyButton ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=document.currentScript;var sec=s.parentElement;var b=sec.querySelector('[data-snippet-copy]');var c=sec.querySelector('[data-snippet-code]');if(!b||!c)return;b.addEventListener('click',function(){navigator.clipboard.writeText(c.innerText).then(function(){var t=b.textContent;b.textContent='Copied';setTimeout(function(){b.textContent=t;},1400);});});})();`,
          }}
        />
      ) : null}
    </section>
  );
}
