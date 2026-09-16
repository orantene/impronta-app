# Hero quality comparison: `high` vs `medium` (03 §7.1, owner decision §1/§6)

**2026-09-16 · 8 type × direction prompts × 2 qualities = 16 images**, `gpt-image-2.5-flare`, `1536x1024`, jpeg. Record: `comparison.json` (prompt, usage, latency, USD per image); pairs: `<type>_<direction>__{medium,high}.jpg`; side-by-side: `contact-sheet.jpg` (left medium, right high); 1:1 crops: `detail-crops.jpg`.

| | medium | high |
|---|---|---|
| output image tokens | 343 | ~1,373 |
| cost per image (list, sync) | **$0.01086** | **$0.04173** (3.84×) |
| cost per image (batch) | $0.00543 | $0.02087 |
| latency (mean of 8) | 9.5 s | 15.1 s |
| failures on first pass | 2 × `rate_limit_exceeded` (parallel pairs) | 1 × `moderation_blocked` (spa "client under a towel on a massage table") |

**Verdict: medium for heroes (D-TPL-27).** On the contact sheet the pairs are indistinguishable in composition, light, realism and negative space; at 1:1 crops `high` has marginally crisper skin and bottle edges, a difference the delivery path erases (hero rendered ≤1440 px wide, library re-encodes to ≤300 KB). Not a meaningful difference for 3.84× the cost and 1.6× the latency. `high` stays available as the admin's per-regeneration option for a specific asset.

**Cost of the full pool at the owner's allocation, all medium** (21 per type × 131 types = 2,751 images, heroes at the measured 1536×1024 price, squares/portraits will be lower): ≈ **$29.9 sync / $14.9 batch**; +30 % QA regeneration ≈ $39 / $19.4. Against the $100 monthly cap: one chunk. Heroes only (655 images): $7.1 sync / $3.6 batch.

**Two findings for the engine, beyond quality:**
1. **Same-scene bias.** 7 of 8 prompts produced the same Tulum vocabulary (concrete arch, palm through a window, sea on the horizon, warm beige) although only the global layer said "Riviera Maya, Mexico" once. The visual-direction layer must carry explicit *setting* variation (interior/exterior, urban/coastal, time of day), or five heroes of one type will be five beige beach rooms. Added to §3b.
2. **Moderation and rate limits are pipeline states, not surprises.** A "client relaxing under a towel" hero was refused (`moderation_blocked`); two parallel calls tripped the rate limit. Jobs need `blocked` as a terminal status with the reason, a prompt rewording retry once (the reworded spa prompt passed), and pacing per organisation tier; batch mode sidesteps the second.

Spend this run: $0.42 (16 images + 3 retries).
