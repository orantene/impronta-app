/**
 * /account/brief — "Tulala AI, Your Brief".
 *
 * WHY THIS LIVES UNDER /account AND NOT IN A DASHBOARD
 * A Brief belongs to a PERSON, not a workspace: `tulala_briefs` is keyed on
 * `profile_id`, and a hybrid who owns a workspace and a talent profile has one
 * brief describing both. Putting it inside the workspace settings shell would
 * have implied one brief per tenant, and would have made it unreachable for a
 * talent with no workspace at all. `/account` is already allow-listed on every
 * surface that has dashboards, so this is reachable from either side.
 *
 * WHAT THIS PAGE IS FOR
 * It is the answer to "what does this thing think it knows about me, and where
 * did it get that". Inference is only defensible if it is inspectable, so the
 * AI assumptions section is not an afterthought here — it is the reason the page
 * exists, and every row on it says where it came from.
 */

import { redirect } from "next/navigation";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  listBriefVersions,
  loadBrief,
} from "@/lib/tulala/brief-store.server";
import {
  factsAwaitingApproval,
  factsByCategory,
  type BriefFact,
} from "@/lib/tulala/brief-store";
import { FACT_KEYS, factKeyDef, type FactCategory } from "@/lib/tulala/fact-keys";
import { BriefFactRow } from "./_fact-row";
import { BriefDangerActions } from "./_danger-actions";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<FactCategory, string> = {
  identity: "About you",
  work: "What you do",
  business: "Your business",
  presence: "Where you already are",
  operations: "How you operate",
  brand: "Brand direction",
  goals: "What you want",
};

const SOURCE_LABELS: Record<BriefFact["source"], string> = {
  user_stated: "You told me",
  url_import: "From your links",
  ai_inference: "I worked this out",
  system_derived: "From your account",
};

function formatValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "—";
  return String(value);
}

export default async function BriefSettingsPage() {
  if (!isSupabaseConfigured()) redirect("/");

  const session = await getCachedActorSession();
  if (!session.user) redirect("/login?next=%2Faccount%2Fbrief");

  const brief = await loadBrief({ kind: "profile", profileId: session.user.id });

  if (!brief) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-5 py-12 sm:py-16">
        <Header updatedAt={null} version={0} />
        <Panel>
          <p className="text-[0.9375rem] leading-[1.6]" style={{ color: "var(--plt-muted)" }}>
            You don&apos;t have a brief yet. A brief is what Tulala remembers about
            your work: what you do, how you operate, and what you&apos;re building.
            It gets written when you talk to the Tulala Agent, and everything in it
            stays yours to correct.
          </p>
        </Panel>
      </div>
    );
  }

  const pending = factsAwaitingApproval(brief);
  const groups = factsByCategory(brief);
  const versions = await listBriefVersions(brief.id);

  // Which vocabulary keys we have nothing for. Shown deliberately: a brief that
  // only displays what it knows reads as complete when it is not, and the gaps
  // are what the next conversation should be about.
  const knownKeys = new Set(brief.facts.map((f) => f.factKey));
  const missing = FACT_KEYS.filter(
    (d) => !knownKeys.has(d.key) && d.category !== "identity",
  );

  const sourceLinks = brief.facts.filter((f) => f.sourceUrl);

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 py-12 sm:py-16">
      <Header updatedAt={brief.updatedAt} version={brief.currentVersion} />

      {pending.length > 0 ? (
        <Panel tone="attention">
          <SectionTitle>
            {pending.length === 1
              ? "One thing I guessed"
              : `${pending.length} things I guessed`}
          </SectionTitle>
          <p
            className="mb-4 text-[0.8125rem] leading-[1.5]"
            style={{ color: "var(--plt-muted)" }}
          >
            I worked these out rather than being told. Nothing here is used until
            you say it&apos;s right.
          </p>
          <div className="flex flex-col gap-2">
            {pending.map((fact) => (
              <BriefFactRow
                key={fact.factKey}
                factKey={fact.factKey}
                label={factKeyDef(fact.factKey)?.label ?? fact.factKey}
                displayValue={formatValue(fact.value)}
                rawValue={
                  typeof fact.value === "boolean" || typeof fact.value === "number"
                    ? String(fact.value)
                    : Array.isArray(fact.value)
                      ? fact.value.join(", ")
                      : String(fact.value ?? "")
                }
                valueType={factKeyDef(fact.factKey)?.type ?? "string"}
                sourceLabel={SOURCE_LABELS[fact.source]}
                sourceExcerpt={fact.sourceExcerpt}
                sourceUrl={fact.sourceUrl}
                confidence={fact.confidence}
                needsApproval
              />
            ))}
          </div>
        </Panel>
      ) : null}

      {groups.map((group) => (
        <Panel key={group.category}>
          <SectionTitle>{CATEGORY_LABELS[group.category]}</SectionTitle>
          <div className="flex flex-col gap-2">
            {group.facts.map((fact) => (
              <BriefFactRow
                key={fact.factKey}
                factKey={fact.factKey}
                label={factKeyDef(fact.factKey)?.label ?? fact.factKey}
                displayValue={formatValue(fact.value)}
                rawValue={
                  typeof fact.value === "boolean" || typeof fact.value === "number"
                    ? String(fact.value)
                    : Array.isArray(fact.value)
                      ? fact.value.join(", ")
                      : String(fact.value ?? "")
                }
                valueType={factKeyDef(fact.factKey)?.type ?? "string"}
                sourceLabel={SOURCE_LABELS[fact.source]}
                sourceExcerpt={fact.sourceExcerpt}
                sourceUrl={fact.sourceUrl}
                confidence={fact.confidence}
                needsApproval={
                  fact.status === "needs_approval" || fact.status === "suggested"
                }
              />
            ))}
          </div>
        </Panel>
      ))}

      {sourceLinks.length > 0 ? (
        <Panel>
          <SectionTitle>Where I looked</SectionTitle>
          <ul className="flex flex-col gap-1.5">
            {Array.from(new Set(sourceLinks.map((f) => f.sourceUrl))).map((url) => (
              <li key={url} className="text-[0.8125rem]" style={{ color: "var(--plt-muted)" }}>
                {url}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {missing.length > 0 ? (
        <Panel>
          <SectionTitle>What I still don&apos;t know</SectionTitle>
          <p
            className="mb-3 text-[0.8125rem] leading-[1.5]"
            style={{ color: "var(--plt-muted)" }}
          >
            None of this is required. It&apos;s here so you can see what a longer
            conversation would cover.
          </p>
          <p className="text-[0.8125rem] leading-[1.7]" style={{ color: "var(--plt-muted)" }}>
            {missing.map((d) => d.label).join(" · ")}
          </p>
        </Panel>
      ) : null}

      {versions.length > 0 ? (
        <Panel>
          <SectionTitle>History</SectionTitle>
          <p
            className="mb-3 text-[0.8125rem] leading-[1.5]"
            style={{ color: "var(--plt-muted)" }}
          >
            Every change keeps the version before it. Nothing overwrites anything.
          </p>
          <ul className="flex flex-col gap-1.5">
            {versions.map((v) => (
              <li
                key={v.version}
                className="flex items-baseline justify-between gap-3 text-[0.8125rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                <span>
                  v{v.version} · {v.reason.replace(/_/g, " ")} · {v.factCount}{" "}
                  {v.factCount === 1 ? "fact" : "facts"}
                </span>
                <span className="plt-mono text-[0.6875rem]">
                  {new Date(v.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <BriefDangerActions
        hasAiFacts={brief.facts.some(
          (f) => f.source === "ai_inference" || f.source === "url_import",
        )}
        restorableVersions={versions.map((v) => v.version)}
      />
    </div>
  );
}

function Header({ updatedAt, version }: { updatedAt: string | null; version: number }) {
  return (
    <>
      <p
        className="plt-mono text-[0.625rem] font-semibold uppercase tracking-[0.22em]"
        style={{ color: "var(--plt-forest)" }}
      >
        Tulala AI
      </p>
      <h1
        className="plt-display mt-2 text-[1.875rem] font-semibold leading-[1.15] tracking-[-0.02em]"
        style={{ color: "var(--plt-ink)" }}
      >
        Your brief
      </h1>
      <p
        className="mt-3 max-w-[560px] text-[0.9375rem] leading-[1.6]"
        style={{ color: "var(--plt-muted)" }}
      >
        What Tulala understands about your work, and where each piece came from.
        Everything here is editable, and anything I worked out myself is marked as
        a guess until you confirm it.
      </p>
      {updatedAt ? (
        <p className="plt-mono mt-3 text-[0.6875rem]" style={{ color: "var(--plt-muted)" }}>
          Version {version} · updated {new Date(updatedAt).toLocaleDateString()}
        </p>
      ) : null}
    </>
  );
}

function Panel({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "attention";
}) {
  return (
    <div
      className="mt-6 rounded-[24px] p-6"
      style={{
        background: "var(--plt-bg-elevated)",
        border:
          tone === "attention"
            ? "1px solid var(--plt-forest)"
            : "1px solid var(--plt-hairline-strong)",
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="plt-display mb-3 text-[1rem] font-semibold tracking-[-0.01em]"
      style={{ color: "var(--plt-ink)" }}
    >
      {children}
    </h2>
  );
}
