---
id: REPO-005
title: "moodle/moodle (upstream source + docs)"
kind: external-repository
url: https://github.com/moodle/moodle
commit: branch main, accessed 2026-08-24
accessed: 2026-08-24
license: GPL-3.0-or-later (studied for format understanding only; no code ported)
---
## Key facts (each verified against named files)
- `lib/filestorage/mbz_packer.php`: .mbz is either ZIP ("moodle2" default pre-2.9)
  or tar+gz; tgz opt-in since 2.6 (MDL-41838), default since 2.9 (MDL-49298).
- `lib/filestorage/tgz_packer.php` docblock: POSIX ustar output; filename ≤100,
  path+name ≤256 chars; non-ASCII filenames not allowed.
- `lib/filestorage/zip_archive.php`: "single disk archives only, no ZIP64
  support" — Moodle itself cannot read/write ZIP64.
- `backup/util/helper/backup_file_manager.class.php` (~45–57): in-archive file
  pool is `files/<first 2 chars of sha1>/<sha1>` (ONE level, unlike the live
  `filedir` two-level split in `lib/filestorage/file_system_filedir.php`).
- `backup/moodle2/backup_stepslib.php` + `backup_final_task.class.php`:
  moodle_backup.xml schema generation; files.xml registered separately at
  archive root.
- `lib/moodlelib.php`: serialized NULL sentinel `$@NULL@$`.
- MDL tracker: MDL-41838, MDL-49298, MDLSITE-5140 document the format history.
