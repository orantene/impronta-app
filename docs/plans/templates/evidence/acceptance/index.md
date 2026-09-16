# Acceptance run

Base http://localhost:3061 · tenant tpl-qa-studio · 2026-09-16T04:24:58.061Z · 102 sites

Outcomes: missing_logo 82 · fallback_used 20 · model copy 82/102 · total cost $1.3483 · mean $0.0132 · mean 21892 ms · max 31207 ms

Hero assertion (no two types share a hero asset; hero from the TYPE pack): FAIL · distinct hero assets 1 across 47 types · hero from type pack 0/102 · shared: 86d3cfd2… (47 types)

| Case | Type | Look | Outcome | Copy | Images (owner/stock/none) | Hero level | ms | Calls (failed) | Cost $ | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| C01 | nail-salon | editorial | missing_logo | model | 0/15/0 | universal | 24425 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C01 | nail-salon | bold | missing_logo | model | 0/15/0 | universal | 24747 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C02 | spa | coastal | missing_logo | model | 0/15/0 | universal | 25907 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C02 | spa | classic | missing_logo | model | 0/15/0 | universal | 16543 | 1 (0) | 0.0134 | no logo; the wordmark carries the header |
| C03 | massage-therapist | coastal | missing_logo | model | 0/14/0 | universal | 25826 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C03 | massage-therapist | classic | missing_logo | model | 0/14/0 | universal | 23619 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C04 | tattoo-studio | coastal | missing_logo | model | 0/15/0 | universal | 22631 | 1 (0) | 0.0199 | no logo; the wordmark carries the header |
| C04 | tattoo-studio | classic | missing_logo | model | 0/15/0 | universal | 19147 | 1 (0) | 0.0156 | no logo; the wordmark carries the header |
| C05 | hair-salon | editorial | missing_logo | model | 0/15/0 | universal | 19121 | 1 (0) | 0.0130 | no logo; the wordmark carries the header |
| C05 | hair-salon | bold | missing_logo | model | 0/15/0 | universal | 26828 | 1 (0) | 0.0176 | no logo; the wordmark carries the header |
| C06 | restaurant | warm | fallback_used | defaults | 0/17/0 | universal | 25647 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C06 | restaurant | minimal | missing_logo | model | 0/15/0 | universal | 23259 | 1 (0) | 0.0209 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C07 | bar | warm | missing_logo | model | 0/17/0 | universal | 16419 | 1 (0) | 0.0127 | no logo; the wordmark carries the header |
| C07 | bar | minimal | missing_logo | model | 0/15/0 | universal | 17695 | 1 (0) | 0.0134 | no logo; the wordmark carries the header |
| C08 | talent-agency | editorial | missing_logo | model | 0/14/0 | universal | 19363 | 1 (0) | 0.0138 | no logo; the wordmark carries the header |
| C08 | talent-agency | bold | fallback_used | defaults | 0/14/0 | universal | 26981 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C09 | yoga-studio | bold | missing_logo | model | 0/15/0 | universal | 23406 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C09 | yoga-studio | studio | missing_logo | model | 0/15/0 | universal | 13433 | 1 (0) | 0.0086 | no logo; the wordmark carries the header |
| C10 | photography-studio | editorial | missing_logo | model | 0/14/0 | universal | 23656 | 1 (0) | 0.0198 | no logo; the wordmark carries the header |
| C10 | photography-studio | bold | fallback_used | defaults | 0/14/0 | universal | 28265 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C11 | beach-club | warm | missing_logo | model | 0/17/0 | universal | 15887 | 1 (0) | 0.0108 | no logo; the wordmark carries the header |
| C11 | beach-club | minimal | missing_logo | model | 0/15/0 | universal | 19627 | 1 (0) | 0.0145 | no logo; the wordmark carries the header |
| C12 | event-venue | night | missing_logo | model | 0/16/0 | universal | 17715 | 1 (0) | 0.0134 | no logo; the wordmark carries the header |
| C12 | event-venue | dark | missing_logo | model | 0/14/0 | universal | 18996 | 1 (0) | 0.0152 | no logo; the wordmark carries the header |
| C13 | coworking | studio | missing_logo | model | 0/15/0 | universal | 20370 | 1 (0) | 0.0169 | no logo; the wordmark carries the header |
| C13 | coworking | editorial | missing_logo | model | 0/15/0 | universal | 18227 | 1 (0) | 0.0138 | no logo; the wordmark carries the header |
| C14 | beauty-academy | playful | missing_logo | model | 0/17/0 | universal | 20821 | 1 (0) | 0.0178 | no logo; the wordmark carries the header |
| C14 | beauty-academy | coastal | missing_logo | model | 0/15/0 | universal | 31207 | 1 (0) | 0.0204 | no logo; the wordmark carries the header |
| C15 | cooking-school | playful | missing_logo | model | 0/17/0 | universal | 23589 | 1 (0) | 0.0207 | no logo; the wordmark carries the header |
| C15 | cooking-school | coastal | fallback_used | defaults | 0/15/0 | universal | 23783 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C16 | diving-school | playful | missing_logo | model | 0/17/0 | universal | 16110 | 1 (0) | 0.0115 | copy lines dropped: home.offer.body (es claim); no logo; the wordmark carries the header |
| C16 | diving-school | coastal | missing_logo | model | 0/15/0 | universal | 19700 | 1 (0) | 0.0160 | no logo; the wordmark carries the header |
| C17 | padel-club | bold | missing_logo | model | 0/15/0 | universal | 26630 | 1 (0) | 0.0209 | no logo; the wordmark carries the header |
| C17 | padel-club | studio | missing_logo | model | 0/15/0 | universal | 25168 | 1 (0) | 0.0142 | no logo; the wordmark carries the header |
| C18 | podcast-studio | studio | missing_logo | model | 0/15/0 | universal | 24080 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C18 | podcast-studio | editorial | fallback_used | defaults | 0/15/0 | universal | 25843 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C19 | pet-grooming | editorial | missing_logo | model | 0/15/0 | universal | 20095 | 1 (0) | 0.0170 | no logo; the wordmark carries the header |
| C19 | pet-grooming | bold | missing_logo | model | 0/15/0 | universal | 16250 | 1 (0) | 0.0139 | no logo; the wordmark carries the header |
| C20 | art-gallery | night | missing_logo | model | 0/16/0 | universal | 14536 | 1 (0) | 0.0103 | no logo; the wordmark carries the header |
| C20 | art-gallery | dark | missing_logo | model | 0/14/0 | universal | 14843 | 1 (0) | 0.0115 | no logo; the wordmark carries the header |
| C21 | wellness-retreat | coastal | missing_logo | model | 0/15/0 | universal | 14367 | 1 (0) | 0.0116 | no logo; the wordmark carries the header |
| C21 | wellness-retreat | classic | missing_logo | model | 0/15/0 | universal | 23880 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C22 | corporate-training | playful | missing_logo | model | 0/17/0 | universal | 18573 | 1 (0) | 0.0140 | no logo; the wordmark carries the header |
| C22 | corporate-training | coastal | missing_logo | model | 0/15/0 | universal | 23944 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C23 | floral-studio | warm | fallback_used | defaults | 0/16/0 | universal | 25901 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C23 | floral-studio | minimal | missing_logo | model | 0/14/0 | universal | 17156 | 1 (0) | 0.0145 | no logo; the wordmark carries the header |
| C24 | escape-room | warm | missing_logo | model | 0/16/0 | universal | 24188 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C24 | escape-room | minimal | missing_logo | model | 0/14/0 | universal | 21389 | 1 (0) | 0.0167 | no logo; the wordmark carries the header |
| C25 | sushi-restaurant | warm | missing_logo | model | 0/17/0 | universal | 17897 | 1 (0) | 0.0131 | no logo; the wordmark carries the header |
| C25 | sushi-restaurant | minimal | missing_logo | model | 0/15/0 | universal | 13714 | 1 (0) | 0.0116 | no logo; the wordmark carries the header |
| C26 | home-takeaway | warm | missing_logo | model | 0/16/0 | universal | 15535 | 1 (0) | 0.0124 | no logo; the wordmark carries the header |
| C26 | home-takeaway | minimal | missing_logo | model | 0/14/0 | universal | 23056 | 1 (0) | 0.0135 | no logo; the wordmark carries the header |
| C27 | social-media-agency | editorial | fallback_used | defaults | 0/14/0 | universal | 27973 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C27 | social-media-agency | bold | fallback_used | defaults | 0/14/0 | universal | 26740 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C28 | eyelash-studio | editorial | fallback_used | defaults | 0/15/0 | universal | 28930 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C28 | eyelash-studio | bold | missing_logo | model | 0/15/0 | universal | 17219 | 1 (0) | 0.0131 | no logo; the wordmark carries the header |
| C29 | immigration-practice | classic | missing_logo | model | 0/14/0 | universal | 24374 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C29 | immigration-practice | playful | missing_logo | model | 0/16/0 | universal | 23806 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C30 | massage-therapist | coastal | missing_logo | model | 0/14/0 | universal | 19154 | 1 (0) | 0.0147 | no logo; the wordmark carries the header |
| C30 | massage-therapist | classic | fallback_used | defaults | 0/14/0 | universal | 27171 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C31 | private-chef | classic | missing_logo | model | 0/14/0 | universal | 15356 | 1 (0) | 0.0116 | no logo; the wordmark carries the header |
| C31 | private-chef | playful | missing_logo | model | 0/16/0 | universal | 23190 | 1 (0) | 0.0180 | no logo; the wordmark carries the header |
| C32 | house-cleaner | classic | missing_logo | model | 0/14/0 | universal | 25383 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C32 | house-cleaner | playful | fallback_used | defaults | 0/16/0 | universal | 24543 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C33 | handyman | classic | missing_logo | model | 0/14/0 | universal | 19497 | 1 (0) | 0.0158 | no logo; the wordmark carries the header |
| C33 | handyman | playful | missing_logo | model | 0/16/0 | universal | 24305 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C34 | provisional-service | editorial | fallback_used | defaults | 0/14/0 | universal | 27237 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C34 | provisional-service | bold | missing_logo | model | 0/14/0 | universal | 25517 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C35 | private-tours | coastal | fallback_used | defaults | 0/14/0 | universal | 25374 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C35 | private-tours | classic | missing_logo | model | 0/14/0 | universal | 26599 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C36 | custom-jewelry | warm | missing_logo | model | 0/16/0 | universal | 15641 | 1 (0) | 0.0123 | no logo; the wordmark carries the header |
| C36 | custom-jewelry | minimal | missing_logo | model | 0/14/0 | universal | 22333 | 1 (0) | 0.0176 | no logo; the wordmark carries the header |
| C37 | portrait-photographer | warm | missing_logo | model | 0/16/0 | universal | 20281 | 1 (0) | 0.0154 | no logo; the wordmark carries the header |
| C37 | portrait-photographer | minimal | missing_logo | model | 0/14/0 | universal | 21851 | 1 (0) | 0.0186 | no logo; the wordmark carries the header |
| C38 | independent-dj | night | missing_logo | model | 0/16/0 | universal | 14291 | 1 (0) | 0.0086 | no logo; the wordmark carries the header |
| C38 | independent-dj | dark | missing_logo | model | 0/14/0 | universal | 21281 | 1 (0) | 0.0171 | no logo; the wordmark carries the header |
| C39 | language-tutor | playful | missing_logo | model | 0/16/0 | universal | 26006 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C39 | language-tutor | coastal | missing_logo | model | 0/14/0 | universal | 26970 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C40 | personal-trainer | bold | missing_logo | model | 0/14/0 | universal | 27641 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C40 | personal-trainer | studio | missing_logo | model | 0/14/0 | universal | 13684 | 1 (0) | 0.0096 | no logo; the wordmark carries the header |
| C41 | makeup-artist | editorial | fallback_used | defaults | 0/14/0 | universal | 27254 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C41 | makeup-artist | bold | fallback_used | defaults | 0/14/0 | universal | 28605 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C42 | translator | classic | missing_logo | model | 0/14/0 | universal | 23751 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C42 | translator | playful | missing_logo | model | 0/16/0 | universal | 15709 | 1 (0) | 0.0123 | no logo; the wordmark carries the header |
| C43 | dog-walker | classic | missing_logo | model | 0/14/0 | universal | 23331 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C43 | dog-walker | playful | missing_logo | model | 0/16/0 | universal | 18903 | 1 (0) | 0.0150 | no logo; the wordmark carries the header |
| C44 | yoga-instructor | playful | missing_logo | model | 0/16/0 | universal | 15970 | 1 (0) | 0.0127 | no logo; the wordmark carries the header |
| C44 | yoga-instructor | coastal | missing_logo | model | 0/14/0 | universal | 15941 | 1 (0) | 0.0125 | no logo; the wordmark carries the header |
| C45 | voice-over | classic | missing_logo | model | 0/14/0 | universal | 13914 | 1 (0) | 0.0097 | no logo; the wordmark carries the header |
| C45 | voice-over | playful | missing_logo | model | 0/16/0 | universal | 21447 | 1 (0) | 0.0131 | no logo; the wordmark carries the header |
| C46 | car-detailing | classic | fallback_used | defaults | 0/14/0 | universal | 26333 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C46 | car-detailing | playful | fallback_used | defaults | 0/16/0 | universal | 25057 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C47 | independent-musician | night | missing_logo | model | 0/16/0 | universal | 25634 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| C47 | independent-musician | dark | missing_logo | model | 0/14/0 | universal | 24818 | 1 (0) | 0.0142 | no logo; the wordmark carries the header |
| C48 | event-host | night | fallback_used | defaults | 0/16/0 | universal | 26164 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| C48 | event-host | dark | missing_logo | model | 0/14/0 | universal | 25618 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| F1 | house-cleaner | classic | missing_logo | model | 0/14/0 | universal | 22744 | 1 (0) | 0.0210 | copy lines dropped: * (not json); no logo; the wordmark carries the header |
| F1 | house-cleaner | playful | fallback_used | defaults | 0/16/0 | universal | 25759 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| F2 | nail-salon | editorial | missing_logo | model | 0/15/0 | universal | 19381 | 1 (0) | 0.0145 | no logo; the wordmark carries the header |
| F2 | nail-salon | bold | fallback_used | defaults | 0/15/0 | universal | 25709 | 1 (1) | 0.0000 | copy pass failed; defaults used; no logo; the wordmark carries the header |
| F3 | restaurant | warm | missing_logo | model | 0/16/0 | universal | 14497 | 1 (0) | 0.0117 | no logo; the wordmark carries the header |
| F3 | restaurant | minimal | missing_logo | model | 0/14/0 | universal | 24072 | 1 (0) | 0.0209 | copy lines dropped: * (not json); no logo; the wordmark carries the header |

Screenshots: `<case>--<type>--<look>/home-{1440,390}.jpg` (header + hero, viewport) and `inner-{1440,390}.jpg` (catalogue page, full).
