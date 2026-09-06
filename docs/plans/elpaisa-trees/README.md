# Parrilla El Paisa — the six page trees

The validated paste set for El Paisa's site, committed so the record does not
live only in a session scratchpad.

## What these are

Six pages as **builder clipboard payloads**: `{ "version": 2, "nodes": [...] }`,
the shape `readStoredBuilderNodeMultiClipboard` and `readOsBuilderClipboard`
accept. Each has one root container. They were built from the restaurant's own
menu JSON, validated with `validateBuilderNodeTree`, rendered through
`renderBuilderNodes`, and rehearsed against the builder's own clipboard readers
and paste transform (30 assertions) on `origin/main`.

Spanish is the design; English rides on every copy node as `i18n.en`. The one
exception is the hero carousel's `sharedContent`, a nested prop the flat overlay
cannot carry, so its English is typed in the inspector after paste.

| Page | Route | Roots | Notes |
|---|---|---|---|
| `inicio.json` | `/` | 1 | hero carousel, six signature cards, story split, reserve band, gallery rail, map |
| `menu.json` | `/menu` | 1 | `menu_board`, honest empty message until the 117 dishes are imported |
| `reservas.json` | `/reservas` | 1 | `reserve_table`, party 1 to 4, pay in person |
| `nosotros.json` | `/nosotros` | 1 | story, photo, three facts |
| `contacto.json` | `/contacto` | 1 | WhatsApp, directions, socials, map, hours |
| `galeria.json` | `/galeria` | 1 | masonry of the 21 dish photos |

## Photo URLs are placeholders, deliberately

Every image `src` is a placeholder of the form `tulala-media://elpaisa/photo-NN`,
never a live URL. CEO rule, 2026-09-06: **a token-shaped string never enters
git, bridge or not.** The restaurant's photos live in their own Firebase
Storage bucket behind `?alt=media&token=…` download tokens; git history is
permanent, so a token committed here would outlive any decision to rotate it,
and the bucket path itself carries their account id.

The placeholder → live URL mapping lives in the build pack **outside this
repository** (`elpaisa-trees/PHOTO-URL-MAP.json` in the session pack, sourced
from the restaurant's own menu JSON), so the trees stay reconstructable without
the repo ever holding a credential. Twenty-one distinct photos, referenced
forty-four times.

So these files are the structure of record, not a one-click paste: during the
build each photo is uploaded to the media library anyway (an `image` node wants
`mediaId`, and a hotlink dies the moment the restaurant rotates a token).

## Design rulings these carry

Creative Direction decision log rows 16 to 21: headings at 36px and up use size
buckets rather than literal pixels, so the hero is not 72px on a phone; every
text-bearing red is `#d21a28`; "Desde" appears only where the catalog holds more
than one price; on charcoal the kicker is cream and the only red is the button.
