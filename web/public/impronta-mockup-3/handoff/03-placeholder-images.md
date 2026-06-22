# Placeholder Image Assets

Use these to fill the hero slider, header logo area, and any demo slides. Two sources:

1. **Committed repo assets (preferred for component DEFAULTS)** — already in the repo, ship to prod, always render (even offline). Use these as the built-in defaults of the gallery component.
2. **Remote Unsplash URLs (for richer variety during design/testing)** — high-res fashion/editorial/lifestyle. Paste into the media picker (URL) while building. They are the exact photos used in the Noir & Or mockup.

> Recommendation: default the shipped component to the committed `/talent-templates/demo/model/` images so it always looks full; use the Unsplash set for variety when demoing.

---

## 1. Committed repo assets (root-relative `/public` paths)

### Genuine model shots (best for hero + portfolio)
```
/talent-templates/demo/model/01-hero.jpg        (hero portrait — best hero image)
/talent-templates/demo/model/02-gown.jpg        (couture gown)
/talent-templates/demo/model/03-runway.jpg
/talent-templates/demo/model/04-runway.jpg
/talent-templates/demo/model/05-editorial.jpg
/talent-templates/demo/model/06-runway.jpg
/talent-templates/demo/model/07-runway.jpg
/talent-templates/demo/model/08-portrait.jpg
/talent-templates/demo/model/09-editorial.jpg
/talent-templates/demo/model/10-editorial.jpg
/talent-templates/demo/model/11-runway.jpg
/talent-templates/demo/model/12-portrait.jpg
```

### Marketing/lifestyle (events / party / runway)
```
/marketing/photos/mk-models-runway.jpg
/marketing/photos/mk-models-party.jpg
/marketing/photos/case-studies/cs-models.jpg
```

### The mockup's bundled copies (59 images)
All images used in the mockup are also under `web/public/impronta-mockup-3/img/` (served at `/impronta-mockup-3/img/<name>.jpg` in dev). NOTE: this folder is currently UNTRACKED in git — commit it if you want these to deploy, or just reference the `/talent-templates/demo/model/` set above which is already committed.

---

## 2. Remote Unsplash URLs (the exact mockup photos)

Pattern: append `?w=1600&q=75&auto=format&fit=crop` (use `w=1800` for full-bleed hero, `w=1200` for portrait cards).

### Hero / full-bleed
```
https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=1800&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?w=1800&q=75&auto=format&fit=crop
```

### Women (portraits / faces)
```
https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1485178575877-1a13bf489dfe?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1517841905240-472988babdf9?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1534030347209-467a5b0ad3e6?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1496360166961-10a51d5f367a?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=1200&q=75&auto=format&fit=crop
```

### Men (portraits / faces)
```
https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1500917293891-ef795e70e1f6?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1504257432389-52343af06ae3?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1521119989659-a83eee488004?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1463453091185-61582044d556?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1488161628813-04466f872be2?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?w=1200&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=1200&q=75&auto=format&fit=crop
```

### Runway / editorial / campaign
```
https://images.unsplash.com/photo-1469371670807-013ccf25f16a?w=1500&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1500&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1445205170230-053b83016050?w=1500&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?w=1400&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1483118714900-540cf339fd46?w=1400&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1400&q=75&auto=format&fit=crop
```

### Lifestyle / resort / Tulum / swim (tasteful)
```
https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?w=1600&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=1400&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=1500&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1520975954732-35dd22299614?w=1400&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1526772662000-3f88f10405ff?w=1400&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1471922694854-ff1b63b20054?w=1600&q=75&auto=format&fit=crop
https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?w=1600&q=75&auto=format&fit=crop
```

> Licensing note: Unsplash photos are free to use under the Unsplash License, but for a SHIPPED product default, prefer the committed `/talent-templates/demo/model/` assets (already vetted for the repo) and swap in licensed/commissioned photography before going live.
