---
id: TASK-003
title: Large-file strategy spike (streaming TAR.GZ + lazy ZIP)
status: done
priority: medium
---
Implements Q-004/Q-005/Q-007; retires RISK-001. Target: 500 MB–1 GB backups on
consumer laptops without UI freeze.

Done 2026-08-25 by ADR-0029 (EXP-004). The remaining ceiling — the decompressed
tar buffer — is TASK-012 (OPFS staging).
