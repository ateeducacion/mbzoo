---
id: STD-001
title: "POSIX tar / ustar archive format (as used by Moodle tgz_packer)"
kind: standard
url: https://github.com/moodle/moodle/blob/main/lib/filestorage/tgz_packer.php
accessed: 2026-08-24
license: n/a (format specification)
---
## Facts used by MBZoo's TarGzReader
512-byte header blocks; name @0..100, size octal @124..136, prefix @345..500;
data padded to 512-byte boundary; two consecutive zero blocks mark the end.
Moodle emits ustar with the documented filename limits (REPO-005).
MBZoo implements only the subset above; no pax/GNU extensions are parsed.
