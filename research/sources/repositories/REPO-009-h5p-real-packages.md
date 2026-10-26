---
id: REPO-009
title: "Real .h5p specimens for playback testing (lumieducation/H5P-Nodejs-library test data)"
kind: external-repository
url: https://github.com/lumieducation/H5P-Nodejs-library
commit: master @ 75d9c75ddc42b1a3fb77c35f972991393ba854e8 (inspected via API)
accessed: 2026-08-25
license: "repository GPL-3.0; bundled content-type libraries mostly MIT, several declare no license; sample content declares license 'U' (undisclosed)"
---
## Why this record exists

ADR-0018 shipped H5P playback validated only against the synthetic
`H5P.MBZooText` fixture. That fixture bypasses everything real content types
do, and two defects survived it into review:

- media never loaded, because content types build images with `new Image()`
  (not `document.createElement`) and `H5P.getPath()` injects a content-id
  path segment the player's shim did not resolve;
- library versions ship as **strings** in real packages
  (`"majorVersion": "1"` in H5P.DragText 1.8), not numbers.

Both were found by running real packages through the viewer, and both are now
covered by unit tests plus the hardened shim.

## Specimens used (downloaded ad hoc, not vendored)

Fetched from `raw.githubusercontent.com` at the commit above:

| path in source repo | sha256 | exercises |
| --- | --- | --- |
| `test/data/example-packages/H5P.DragText.h5p` | `75c1b26e88285b7f54534ac56bf4c0b9de9f6a2a63cb85378a0538a0408d0852` | 9-library dependency graph (jQuery.ui, JoubelUI, Question, Tether, Drop), string versions |
| `test/data/validator/valid3-3-images.h5p` | `d0a87ddf002920b8f320e643e6a375ea93ae0c44178fcfc2f6a287a7d5dfb721` | `content/` media through the VFS shim (H5P.Agamotto 1.5) |
| `packages/h5p-server/test/data/packages/greetingcard1.h5p` | `06c18aad56b78c306b9c366be0d9b9053a8c52792c9957fa2ed092c88985aa6d` | minimal single-library package |
| `test/data/validator/broken-content-json.h5p` | `3684db7892999532903eb9a76743fe21e4b55d01cc0b213406344f70f366d2bd` | malformed `content.json` — must degrade to the download card |
| `test/data/validator/corrupt_archive.h5p` | `94ee059335e587e501cc4bf90613e0814f00a7b08bc7c648fd865a2af6a22cc2` | not a ZIP at all — unzip rejection path |

## Use in MBZoo

Secondary specimen source for manual and opt-in testing, same policy as
REPO-004: **do not vendor into this repo.** Reasons specific to `.h5p`:

- Licensing is worse than the RISK-004 case this project is already trying to
  resolve. Inside the two packages inspected, `H5P.FontIcons`, `H5P.JoubelUI`,
  `H5P.Image` and `H5PEditor.ColorSelector` declare **no license** in their
  `library.json`, and both sample contents declare `license: "U"`
  (undisclosed). Committing them would import undeclared-license third-party
  code into an MIT repository.
- The source repository is GPL-3.0.
- Committed fixtures must be synthetic and deterministic (AGENTS.md); these
  are byte-stable, so checksums would work, but provenance and license do not
  clear the bar.

Preferred path instead: extend `fixtures/scripts/generate-fixture.ts` so the
synthetic package reproduces the shapes that actually broke — string
versions, a nested dependency chain, and a `content/` image referenced the way
`H5P.getPath()` builds it. That keeps CI fixtures synthetic while covering the
real failure modes.

## Rejected alternative: exelearning/exelearning

Checked 2026-08-25 for `.h5p` specimens: the repository contains **zero**
`.h5p` files. Its `test/fixtures/` holds `.elp`/`.elpx` files (a different
format, 2-31 MB each) under an AGPL-3.0 repository. Useful later for the
planned eXeLearning inspection work, not for H5P.
