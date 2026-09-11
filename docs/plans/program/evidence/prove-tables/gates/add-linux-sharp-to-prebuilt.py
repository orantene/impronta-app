#!/usr/bin/env python3
"""
Post-`vercel build` step for a prebuilt deployment made on a Mac.

`@vercel/nft` traces sharp's native binary for the platform the build ran on,
so the function bundles named only `@img/sharp-darwin-arm64` and the Lambda
(linux-arm64) died with `Could not load the "sharp" module`. This adds the
linux-arm64 packages (unpacked by hand into node_modules/@img, see host.md) to
the `filePathMap` of every function that already ships the darwin ones.

Run from the repo root after `vercel build`, before `vercel deploy --prebuilt`.
Touches only `.vercel/output` (gitignored).
"""
import json, os, sys

ROOT = os.getcwd()
PKGS = ["@img/sharp-linux-arm64", "@img/sharp-libvips-linux-arm64"]
files = []
for pkg in PKGS:
    base = os.path.join(ROOT, "web", "node_modules", pkg)
    if not os.path.isdir(base):
        sys.exit(f"missing {base}: unpack the linux-arm64 sharp packages first")
    for dirpath, _, names in os.walk(base):
        for n in names:
            rel = os.path.relpath(os.path.join(dirpath, n), ROOT)
            files.append(rel)

patched = 0
for dirpath, dirnames, names in os.walk(os.path.join(ROOT, ".vercel", "output", "functions")):
    if ".vc-config.json" not in names:
        continue
    cfg_path = os.path.join(dirpath, ".vc-config.json")
    cfg = json.load(open(cfg_path))
    fpm = cfg.get("filePathMap")
    if not fpm or not any("sharp-darwin-arm64" in k for k in fpm):
        continue
    for rel in files:
        fpm.setdefault(rel, rel)
    json.dump(cfg, open(cfg_path, "w"))
    patched += 1
print(f"added {len(files)} linux-arm64 sharp files to {patched} function(s)")
