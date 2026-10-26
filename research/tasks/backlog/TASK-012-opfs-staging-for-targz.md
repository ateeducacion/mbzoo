---
id: TASK-012
title: OPFS staging for TAR.GZ
status: open
priority: medium
---
ADR-0029 brought TAR.GZ peak memory down to roughly the decompressed size, but gzip is one stream, so that buffer is inherent unless the decompressed tar is staged to the Origin Private File System and read by offset. Browser-only capability, so it belongs in the viewer as an ArchiveReader implementation, not in core (ADR-0004). Q-007.

Narrowed by ADR-0036 (2026-08-28): the decompressed tar is now staged in a Blob, which is portable and took the renderer's peak on a 1,385 MB backup from 1,766 MB to 425 MB (EXP-005). The bytes still exist, held by the browser process and paged at its discretion, so OPFS remains the answer if a specimen ever exceeds what blob storage will take. Not urgent; no longer the only path off the ceiling.
