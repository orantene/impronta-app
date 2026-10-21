import type { ReactNode } from "react";

import { MarketingShell } from "@/components/marketing/shell";

/**
 * TUL-1399: marketing chrome plus the typography the Posts renderers expect.
 * On a workspace site the theme supplies the `.site-post*` styles; on the marketing
 * host there is no theme, so this scoped sheet gives posts a readable default.
 */
const CSS = `
.platform-blog{max-width:44rem;margin:0 auto;padding:4rem 1.25rem 5rem;color:var(--plt-ink)}
.platform-blog .site-post__meta{font-size:.8125rem;color:var(--plt-muted);margin:0 0 .75rem}
.platform-blog .site-post__title{font-size:clamp(1.9rem,5vw,2.6rem);line-height:1.1;margin:0 0 1rem}
.platform-blog .site-post__byline{font-size:1.0625rem;line-height:1.7;color:var(--plt-ink-soft);margin:0 0 1.5rem}
.platform-blog .site-post__hero img,.platform-blog img{max-width:100%;height:auto;border-radius:12px}
.platform-blog p,.platform-blog li{font-size:1rem;line-height:1.75;color:var(--plt-ink-soft)}
.platform-blog h2{font-size:1.5rem;line-height:1.25;margin:2rem 0 .75rem}
.platform-blog h3{font-size:1.2rem;line-height:1.3;margin:1.5rem 0 .5rem}
.platform-blog a{color:var(--plt-forest);text-decoration:underline;text-underline-offset:2px}
.platform-blog ul,.platform-blog ol{padding-left:1.25rem}
.platform-blog .site-post__list{list-style:none;padding:0;display:flex;flex-direction:column;gap:1.25rem}
.platform-blog .site-post__list-item a{font-size:1.125rem;font-weight:600}
`;

export async function PlatformBlogFrame({ children }: { children: ReactNode }) {
  return (
    <MarketingShell>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <main className="platform-blog">{children}</main>
    </MarketingShell>
  );
}
