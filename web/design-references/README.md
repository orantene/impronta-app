# Design references

Approved design mockups, pinned in the repo so agents (local or cloud) and the parity
tool compare against a stable, versioned reference instead of a session scratchpad.

| Design | Folder | Source artifact | Reference demo |
|---|---|---|---|
| Maison v2 (Rosé palette) | `maison-v2/` | https://claude.ai/artifact/NwPUiuw85SrcFWHjogZ13j | Alba, TAL-93020 |
| Folio (TH02) | `folio/` | https://claude.ai/artifact/QHVfJH5oHTc2EkM2VKXpR2 | Mateo Ferrer, TAL-93011 |
| Gridline (TH16) | `gridline/` | https://claude.ai/artifact/NeeTxAYqeRypvSF7AaVdsc | Alex Treviño, TAL-93030 |
| Solace (DRAFT) | `solace/` | Developer draft for PM review (TUL-328) | Valeria Ortiz, TAL-93001 |
| Mono (DRAFT) | `mono/` | Developer draft for PM review (TUL-328) | Pablo Serrano, TAL-93010 |
| Frame (DRAFT) | `frame/` | Developer draft for PM review (TUL-328) | Tomás Aguilar, TAL-93009 |
| Support Desk (Phase 0.5) | `support-desk/` | Phase 0.5 HTML mockups (optional reference) | Live: `support.tulala.digital/desk` |

## Theme Review mockup (bar)

A Theme Review mockup is the pinned pack that proves a collection Design is
finished enough to open to talents. Required under `web/design-references/<slug>/`:
`index.html`, `kit.js`, `img/` (when photos are local), `README.md`,
`parity-map.json`, `content.json`, plus a row in this table. Every unit carries
`data-w="<kit type> · <variant>"`. After Factory publish, pull the authored
overlay (`npm run theme:pull-authored -- --design <slug>`).

Unfinished collection designs (`solace`, `mono`, `frame`) have DRAFT packs
(`index.html`, `kit.js`, `img/`, `README.md` marked DRAFT, plus `parity-map.json`
and `content.json` drafted from the mockup) for PM review. They are ready for
Oran's pack approval and stay hidden from the default gallery until he approves
the pack, the Factory publish and `theme:pull-authored` land, and the design gap
in `COLLECTION_DESIGN_GAPS` closes.

Serve locally (launch config `factory-mockup`, port 3098):
`python3 -m http.server 3098 --bind 127.0.0.1 --directory web/design-references`
then open `http://localhost:3098/maison-v2/` or `http://localhost:3098/folio/`.

Support Desk mockups use port **3099** (parity tool default):
`cd web && npm run mockup:support-desk` → `http://127.0.0.1:3099/support-desk/`.

Every unit in a mockup carries `data-w="<kit type> · <variant>"`. That attribute is the
contract the parity tool and the design compiler map to kit blocks. A unit whose type or
variant has no kit block is a new-capability ticket.

To update a reference: re-export the artifact into its folder, note the date and artifact
version below, and re-run `npm run qa:mockup-parity` so the baseline is refreshed.
Fictional mockup data (addresses, handles, demo numbers) never ships as product data.
