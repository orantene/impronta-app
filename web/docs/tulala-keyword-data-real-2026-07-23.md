# Tulala — Real keyword volumes (Google Keyword Planner, 2026-07-23)

**Source:** Google Keyword Planner, account 490-913-7187, date range Jul 2025 – Jun 2026.
**Why this doc exists:** the original `_seo-run/keyword-map.md` was reasoning-based. These are Google's own numbers. Where the two disagree, this file wins.

**Read the ranges honestly.** An account with no ad spend sees bucketed ranges (`0–10`, `10–100`, `100–1K`), not exact volumes. The buckets are still decisive for the comparisons below, because the differences are order-of-magnitude, not marginal.

---

## 1. The headline finding: volumes are small

Almost every term we built a page for lands in **10–100 searches/month**. Nothing we target is a high-volume head term. This is the single most important correction to the original plan.

### United States, English

| Keyword | Avg. monthly searches | Competition |
|---|---|---|
| hire a private chef | **100 – 1K** | Medium |
| hire a chef for a party | **100 – 1K** | High |
| hire a personal chef | **100 – 1K** | Medium |
| photography booking site | **100 – 1K** | High |
| private chef booking | 10 – 100 | High |
| photographer booking site | 10 – 100 | High |
| talent booking platform | 10 – 100 | Low |
| booking site for photographers | 10 – 100 | High |
| best booking site for photographers | 10 – 100 | High |

### Mexico, mixed EN/ES seeds

| Keyword | Avg. monthly searches | Competition |
|---|---|---|
| **agencia de talento** | **100 – 1K** | **Low** |
| contratar chef privado | 10 – 100 | Low |
| contratar modelos | 10 – 100 | Low |
| photographer booking site | 10 – 100 | — |
| hire a private chef | 10 – 100 | — |
| private chef booking | 0 – 10 | — |
| talent booking platform | 0 – 10 | — |
| best booking site for photographers | 0 – 10 | — |

87 keyword ideas were returned for the Mexico query, 80 for the US query.

---

## 2. What this changes

### 2.1 Demand-side beats supply-side by ~10x (US)

`hire a private chef` (100–1K) versus `private chef booking` (10–100). The people **hiring** talent search roughly ten times more than the talent looking for a booking tool.

Our nine `/for/{category}` pages are written for the **talent** side. They are not wrong, and they are cheap to maintain (one data entry each), but they will not individually produce meaningful traffic at 10–100/month.

The plan already listed client-side "hire" pages as Wave 3 and gated them on directory density. **That gate is now the main growth lever, not a nice-to-have.** Building them before the directory has real talent in it would produce pages that rank for a query we cannot satisfy, so the sequencing still holds. The priority does not.

### 2.2 `agencia de talento` is the best term found

100–1K/month in Mexico at **Low** competition, and it describes what Tulala is. Nothing else in either dataset combines that volume with that little competition.

Low competition here is the paid-search metric, not organic difficulty, but the two correlate loosely and it is the strongest signal we have.

### 2.3 English terms are near-dead in Mexico

`private chef booking` and `talent booking platform` both drop to **0–10** in Mexico. If Mexico is the primary market, the Spanish pages are not a translation courtesy, they are the actual product surface. That validates shipping ES alongside EN rather than after it.

---

## 3. Honest implication for the whole SEO effort

At these volumes, **organic search will not be a major acquisition channel for Tulala in the near term.** Even ranking #1 for most of these terms is tens of visits a month, not thousands.

That does not make the work wasted. The foundation (schema, canonical, hreflang, sitemap, working share previews) is table stakes, it compounds, and it cost days rather than months. But the honest expectation is:

- Organic is a **long-tail, slow-compounding** channel here, not a growth engine.
- The realistic near-term channels are **direct, brand, referral, and the shared network** inside the product.
- The one genuinely promising organic bet is the **Spanish agency/talent terms in Mexico**, led by `agencia de talento`.

Anyone promising a large organic lift from these keywords is not reading the volume data.

---

## 4. Recommended next actions

1. **Search Console is now the source of truth.** It is verified and the sitemap is submitted. In 2-4 weeks, Performance → Queries shows what Tulala *actually* gets impressions for. Real data beats both this file and the original map, because it is our own site.
2. **Do not build more `/for/{category}` pages** on volume grounds alone. Nine is enough until GSC shows which ones earn impressions.
3. **Consider a Spanish agency-focused page** targeting `agencia de talento` and its long tail. Best volume-to-competition ratio available.
4. **Revisit client-side "hire" pages** once the directory has enough talent to satisfy the query.
5. **Do not buy Ahrefs or SimilarWeb yet** ($125-333/month). There are no rankings to defend and no traffic to analyse. Revisit once GSC shows real impressions.
