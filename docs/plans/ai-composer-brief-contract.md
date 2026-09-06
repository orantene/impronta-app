# The AI composer and the brief — contract

**Status:** proposed, for Front Door and Creative to shape their halves against.
**Owner of this document:** Page Builder. **Owner of intake:** Front Door. **Owner of the mapping rules:** Creative.

The composer's job: take a business's brief and produce the page set a tenant would
otherwise build by hand — pages, trees, and a theme patch. El Paisa's hand-built site
is the reference standard; a second business must be generated from a pasted brief and
judged against it.

---

## 0. Read this first: the vocabulary already exists

The proposal that reached me said "no new schema". That is **true of the tables and
misleading about the work.**

`web/src/lib/tulala/fact-keys.ts` already defines a **versioned vocabulary** —
`FACT_VOCABULARY_VERSION = 1`, **43 keys**, each with a value type, a category, a
settings label, optional enum `allowed` values, evidence weights, and a `personal`
flag that drives redaction before any fact reaches a model prompt.

Of the ten keys proposed for the composer:

| Already defined | New — needs a vocabulary entry |
|---|---|
| `business.name`, `business.description` | `business.category`, `business.hours`, `business.socials`, `brand.logo_url`, `brand.palette`, `brand.fonts`, `menu.categories`, `menu.items` |

So the work is **extending a versioned vocabulary**, not inventing keys. That file
carries a version constant precisely because adding and re-meaning keys are different
acts: the comment says bump it *when a key's meaning changes, not when a key is added*.

**Consequence for this contract:** every key below must land in `fact-keys.ts` with a
type and, where the value is enum-ish, an `allowed` list — because `validateFactValue`
already rejects a model that invents a fifth answer. That rejection is free and we
should not build a parallel validator to duplicate it.

---

## 1. What the composer takes in

Three inputs, all of which already exist.

**The brief store.** `tulala_briefs` (id, signup_lead_id, tenant_id, locale, status,
current_version, engine_version) and `tulala_brief_facts` (brief_id, fact_key,
fact_value JSONB, source, confidence, status, source_url, source_excerpt).

**The tenant's design.** `preset.designId`, via the cached `loadTenantWords` reader.
This is the **single source** of a tenant's default design (ruled), and the page-less
storefront fallback already reads it. The composer resolves the same value; it must
not run its own matcher, or we are back to two sources of design truth.

**The unit is a FACT.** Not a form field. A fact carries `confidence`, `status`,
`source` and `source_excerpt`, and the composer decides what to do with a weak one.

> **A low-confidence or unconfirmed fact is the composer's decision to skip, not the
> intake's decision to hide.** Intake records what it found and how sure it is;
> suppressing it upstream destroys the evidence a later run would use.

### The join, and why it must be stamped

`signup_lead_id` joins the brief to the lead. **Provisioning stamps `tenant_id` on the
brief**, and that stamp is what makes a second run possible: "Regenerate from brief"
starts from a workspace, not from a signup, and without the stamp there is no path
from a tenant back to the brief that produced it.

### Ordering constraint, and it is load-bearing

**Facts must be written BEFORE starter content runs.**

`onboardStarterContent` derives nav labels and homepage copy from settings **at seed
time and never re-derives**. A fact that arrives afterwards changes nothing that is
already on the page. This is not a preference about pipeline shape; it is why a
restaurant whose preset arrived late shipped with an agency's nav.

---

## 2. What the composer must never invent

The composer writes a business's public website. Everything on it is a claim that
business is making.

- **No fact it was not given.** Opening hours, prices, addresses, phone numbers,
  claims about the business. A missing hours fact produces a page with no hours, not
  a plausible one.
- **No menu items.** A menu is a price list. An invented dish is a lie with a number
  next to it.
- **No design id.** It resolves `preset.designId`; it does not pick.
- **No token values.** The theme patch goes through `applyBrandBrief`, which either
  passes `validateThemePatch` or refuses whole.
- **No filling of a redacted fact.** `personal: true` facts are stripped before a
  prompt; the composer must not reconstruct what redaction removed.

Copy is the one place invention is the point — headlines, section intros, calls to
action, in the business's own register. That is generation. Facts are not.

---

## 3. How it validates — the live order, proved tonight

**Personalise first, then validate against the real registry.**

Three blank El Paisa pages in one day came from getting this wrong, each from a
different cause: a repeater the renderer would not accept (#1752), a token key that was
projected but never registered (the template write), and two paragraphs emptied by a
stripped placeholder (#1817). In each, something produced a tree that *looked* fine and
the validator refused it.

The rules that follow:

1. **Validate with the registry the renderer actually uses.** A tree validated against
   anything else is validated against a neighbour. `menu_board` was rejected as a child
   of `container` by a rule no author knew about.
2. **Bake before validating.** `bakePageDesignTree` expands repeaters against the
   design's own `dataSources` and re-mints ids. A raw tree is not the tree that renders.
3. **A validator that refuses is right; a fallback that answers with nothing is not**
   (#1835). `resolveSnapshotBuilderTree` now prunes the nodes the validator names and
   serves the remainder, logging what it dropped. The composer must expect salvage, and
   must treat a `salvaged: true` result as a **failed compose** even though the page
   renders — a page missing the block it was asked for is not a success.
4. **Assert the RENDER, never the resolver.** "Returned a tree" and "that tree renders"
   are different claims. The fallback shipped with tests for the first and a live
   restaurant served an empty `<main>`.

---

## 4. How a run is repeatable

"Regenerate from brief" is not signup. It runs on a workspace that already has content,
possibly edited by hand.

- **Find the brief from the tenant** via the stamped `tenant_id`.
- **Never overwrite authored content.** A page a human has edited is out of scope for
  regeneration unless explicitly chosen. The signal is the page's own edit history, not
  a guess about whether the content "looks generated".
- **Regeneration is a proposal.** It produces a new draft the operator publishes, so a
  bad run costs a discarded draft rather than a live site.
- **Record the inputs.** `engine_version` and `FACT_VOCABULARY_VERSION` at run time, so
  a later replay can tell "the rules changed" from "the facts changed".

---

## 5. What must be proved before this is called working

Two things this codebase has repeatedly got wrong, stated as acceptance criteria:

**An empty table is not evidence of a working writer.** From
`docs/plans/qa/upsert-conflict-audit.md`: two writers shipped that could never insert a
row, passed every gate, and were indistinguishable from a feature nobody had used. The
composer writes pages, facts and a theme patch. Each writer needs a test that proves a
row **arrives**, not that the call was made.

**A generated page must be rendered, not just resolved.** The acceptance is markup
containing the blocks the brief asked for — for El Paisa, a `menu_board` on the Menú
page and a `reserve_table` on Reservas — asserted through the real render path.

---

## 6. Open questions for the other halves

**Front Door:** the eight new keys need `fact-keys.ts` entries with types and `allowed`
lists. `brand.palette` as "3–5 hexes without roles" — is the count enforced, and what
happens to a sixth? `menu.items` at El Paisa's scale is 117 rows; is that one fact or
one per item, and what is the confidence unit?

**Creative:** `applyBrandBrief` is mine to build and the mapping rules are yours. The
base-preset question stands — `editorial-bridal` sets ~35 tokens where four are wanted;
`classic` plus four explicit typography tokens is the cleaner base, and the contrast
rule's worked example is background-dependent in a way that interacts with that choice.

**Both:** a fact with `confidence` below the bar and `status` unconfirmed — does the
composer skip the block, render it empty, or render a prompt to the operator? This is
a product decision, not an engineering one, and the page looks different for each.
