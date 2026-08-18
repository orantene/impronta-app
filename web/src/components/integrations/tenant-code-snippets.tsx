import {
  selectSnippetsForRender,
  selectionDroppedAnything,
  type CodeSnippetPlacement,
  type RenderableSnippet,
} from "@/lib/site-admin/code-snippets";
import { loadPublishedCodeSnippets } from "@/lib/site-admin/server/code-snippets-reads";
import { improntaLog } from "@/lib/server/structured-log";

/**
 * Storefront injector for the custom-code snippet library
 * (Website → Setup → Custom code).
 *
 * WHERE THIS MAY RUN
 * ──────────────────
 * Both components are mounted from the ROOT layout behind `publicScope`, which
 * is non-null only when middleware resolved the request host to a tenant
 * storefront. That single condition is what keeps custom code off the admin
 * app, off `/auth`, off onboarding and off the platform marketing surface — the
 * same gate `TenantCustomCodeHead` (the legacy single-blob injector this sits
 * beside) has always used.
 *
 * WHAT MAY BE RENDERED
 * ────────────────────
 * Whatever `selectSnippetsForRender` returns, and nothing else. That function
 * re-checks the owning tenant, the published flag, the placement, the kind and
 * the breakout rules — see `lib/site-admin/code-snippets.ts`. Keeping the
 * decision there and the markup here means the security rules are unit-tested
 * without a DOM, and this file has no branch of its own to get wrong.
 *
 * WHY `dangerouslySetInnerHTML` IS CORRECT HERE
 * ────────────────────────────────────────────
 * `<style>` and `<script>` are raw-text elements: their contents are CSS/JS, not
 * markup, and React's text escaping would corrupt them (`a > b` becoming
 * `a &gt; b` in a script is a syntax error, not a safety win). The real defence
 * for a raw-text element is that its content cannot CLOSE the element — which is
 * exactly what `inlineCodeBreakout` enforces upstream, by rejecting rather than
 * escaping. Every attribute here is either a literal or a UUID, so nothing
 * tenant-authored is interpolated into an attribute at all.
 *
 * WHAT IS NOT INJECTED
 * ────────────────────
 * `external_script` / `external_style` rows. The CSP names a fixed list of
 * script/style hosts and a tenant's CDN is not on it, so those tags would be
 * blocked by the browser and the snippet would silently do nothing. They are
 * refused in the editor instead. Full reasoning in `code-snippets.ts`.
 */

/** One snippet as its tag. `head` styles are hoisted into the real `<head>`. */
function SnippetTag({
  snippet,
  placement,
}: {
  snippet: RenderableSnippet;
  placement: CodeSnippetPlacement;
}) {
  if (snippet.kind === "css") {
    // React 19 hoists a <style> carrying `href` + `precedence` into <head> and
    // dedupes it by href. If that ever stops happening the style simply renders
    // where it stands, which still applies to the whole document — so this is an
    // upgrade, never a dependency.
    if (placement === "head") {
      return (
        <style
          href={`tenant-code-snippet-${snippet.id}`}
          precedence="tenant-custom-code"
          data-tenant-snippet={snippet.id}
          // eslint-disable-next-line react/no-danger -- raw-text element: contents are CSS, and `inlineCodeBreakout` already rejected anything that could close the tag
          dangerouslySetInnerHTML={{ __html: snippet.code }}
        />
      );
    }
    return (
      <style
        data-tenant-snippet={snippet.id}
        // eslint-disable-next-line react/no-danger -- raw-text element: contents are CSS, breakout-checked upstream
        dangerouslySetInnerHTML={{ __html: snippet.code }}
      />
    );
  }
  return (
    <script
      data-tenant-snippet={snippet.id}
      // eslint-disable-next-line react/no-danger -- raw-text element: contents are JS, and `inlineCodeBreakout` already rejected anything that could close the tag
      dangerouslySetInnerHTML={{ __html: snippet.code }}
    />
  );
}

async function renderPlacement(
  tenantId: string,
  placement: CodeSnippetPlacement,
): Promise<React.ReactElement | null> {
  const rows = await loadPublishedCodeSnippets(tenantId);
  const selection = selectSnippetsForRender(rows, { tenantId, placement });

  // A snippet that does not appear on the page must be explainable. Anything
  // dropped is logged once with its reason rather than vanishing.
  if (selectionDroppedAnything(selection)) {
    void improntaLog("tenant_code_snippets.dropped", {
      tenantId,
      placement,
      ...selection.dropped,
    });
  }

  if (selection.snippets.length === 0) return null;
  return (
    <>
      {selection.snippets.map((snippet) => (
        <SnippetTag key={snippet.id} snippet={snippet} placement={placement} />
      ))}
    </>
  );
}

/** Snippets the operator placed at the top of the page. */
export async function TenantCodeSnippetsHead({ tenantId }: { tenantId: string }) {
  return renderPlacement(tenantId, "head");
}

/** Snippets the operator placed at the end of the page. */
export async function TenantCodeSnippetsBody({ tenantId }: { tenantId: string }) {
  return renderPlacement(tenantId, "body_end");
}
