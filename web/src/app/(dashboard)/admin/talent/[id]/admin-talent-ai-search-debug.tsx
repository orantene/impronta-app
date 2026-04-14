import { loadAiSearchDocumentDebug } from "@/lib/ai/ai-search-document-debug";
import { getCachedServerSupabase } from "@/lib/server/request-cache";

export async function AdminTalentAiSearchDebug({ talentId }: { talentId: string }) {
  const supabase = await getCachedServerSupabase();
  if (!supabase) return null;

  const dbg = await loadAiSearchDocumentDebug(supabase, talentId);

  return (
    <section className="mt-8 rounded-lg border border-border bg-muted/30 p-4 text-sm">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        AI search document (debug)
      </h3>
      <dl className="space-y-2">
        <div>
          <dt className="text-xs text-muted-foreground">Embedding row</dt>
          <dd className="font-mono text-xs">
            {dbg.hasEmbedding ? "present (talent_embeddings)" : "none — run embed worker"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Contributors (rebuild rules)</dt>
          <dd>
            {dbg.contributors.length === 0 ? (
              <span className="text-muted-foreground">No AI-visible lines</span>
            ) : (
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                {dbg.contributors.map((c, i) => (
                  <li key={`${c.source}-${c.detail}-${i}`}>
                    <span className="text-muted-foreground">{c.source}:</span> {c.detail}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-xs text-muted-foreground">Stored ai_search_document</dt>
          <dd>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 font-mono text-[11px] leading-relaxed">
              {dbg.storedDocument?.trim() || "(empty)"}
            </pre>
          </dd>
        </div>
      </dl>
    </section>
  );
}
