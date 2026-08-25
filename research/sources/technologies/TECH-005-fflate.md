---
id: TECH-005
title: fflate
kind: technology
url: https://github.com/101arrowz/fflate
version: 0.8.3 (installed)
accessed: 2026-08-24
license: MIT
---
Selected initial ZIP implementation (ADR-0005): synchronous, dependency-free
semantics identical across browsers/Bun/Node; also used for deterministic
fixture generation. Limitation: materializes entries in memory (RISK-001).
