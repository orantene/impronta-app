# Design references

Approved design mockups, pinned in the repo so agents (local or cloud) and the parity
tool compare against a stable, versioned reference instead of a session scratchpad.

| Design | Folder | Source artifact | Reference demo |
|---|---|---|---|
| Maison v2 (Rosé palette) | `maison-v2/` | https://claude.ai/artifact/NwPUiuw85SrcFWHjogZ13j | Alba, TAL-93020 |
| Folio (TH02) | `folio/` | https://claude.ai/artifact/QHVfJH5oHTc2EkM2VKXpR2 | Mateo Ferrer, TAL-93011 |
| Support Desk (Phase 0.5) | `support-desk/` | Phase 0.5 brief mockups | — |

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
