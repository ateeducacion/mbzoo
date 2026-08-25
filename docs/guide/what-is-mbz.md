# What is an .mbz?

An `.mbz` file is a **Moodle course backup**: a package containing the course's
sections, activities, files, settings and (optionally) user data.

## Container formats

| Format | Since | Notes |
|---|---|---|
| ZIP | Moodle 2.0 | No ZIP64 support inside Moodle itself (4 GB practical cap) |
| TAR.GZ | default since 2.9 (opt-in 2.6) | POSIX ustar; no size cap in practice |

MBZoo detects the format from magic bytes and supports **both**.

## Inside the archive

```
moodle_backup.xml          course/section/activity skeleton
files.xml                  file index (contenthash, component, filearea…)
course/course.xml          full course metadata (fullname lives here)
sections/section_N/        per-section name, summary, activity order
activities/<mod>_N/        per-activity XML (module.xml, <mod>.xml)
files/<2 hex>/<sha1>       content-addressed file pool
```

Facts verified against Moodle source (`moodle/moodle`, REPO-005) and real
backups — see `research/` in the repository.

## What MBZoo does with it

MBZoo parses the minimum XML subset needed to rebuild the course navigation
tree, then extracts content (pages, PDFs, websites, questions…) **on demand,
in your browser**. Nothing is uploaded — see [Privacy](/PRIVACY.html).
