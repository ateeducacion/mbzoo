---
id: REPO-004
title: "saylordotorg/course_backups"
kind: external-repository
url: https://github.com/saylordotorg/course_backups
commit: master @ 56309a17d2a62eca3de0339bc3fbb3f6527fcec6 (inspected via API)
accessed: 2026-08-24
license: "CC BY asserted in README prose; NO LICENSE file; embedded third-party materials under varied licenses"
---
## Facts observed
- ~111 `.mbz` files (~760 MB total) plus ~100 Common Cartridge files;
  content-only backups of Saylor Academy Moodle courses.
- Verified empirically: 2017 batch = Moodle 3.3.1+, 2020 batch = Moodle 3.8.4+.
- Spot-checked PRDV103 (43 KB) and ESL003 archives contain **tar.gz**, not ZIP
  payloads; `<contents>` shows no `<user>` entries in the two samples checked.
- README states CC BY applies to Saylor's original course materials only.

## Use in MBZoo
Secondary fixture source: real-world TAR.GZ backups across two Moodle versions.
Policy (see compliance/licensing): do NOT vendor wholesale into this repo;
download selectively for manual testing, record provenance + sha256 per file,
prefer synthetic fixtures for committed test data.
First inspected file: prdv103/PRDV103-2017-07-21-mbz.mbz,
sha256 77df2b341aa044bea7cfcec615aa7698a486b99d68f1898a8f47e076df6f12cc.
