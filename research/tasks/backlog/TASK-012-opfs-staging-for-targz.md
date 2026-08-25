---
id: TASK-012
title: OPFS staging for TAR.GZ
status: open
priority: medium
---
ADR-0029 brought TAR.GZ peak memory down to roughly the decompressed size, but gzip is one stream, so that buffer is inherent unless the decompressed tar is staged to the Origin Private File System and read by offset. Browser-only capability, so it belongs in the viewer as an ArchiveReader implementation, not in core (ADR-0004). Q-007.
