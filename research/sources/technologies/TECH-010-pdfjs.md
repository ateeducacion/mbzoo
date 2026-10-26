---
id: TECH-010
title: pdf.js (pdfjs-dist)
kind: technology
url: https://github.com/mozilla/pdf.js
version: 6.2.108 (installed, viewer only)
accessed: 2026-08-25
license: Apache-2.0
---
Mozilla's PDF renderer. Selected to draw PDFs onto canvas because Chrome
blocks blob-PDF iframes in sandboxed contexts (ADR-0014). Worker bundled via
Vite `?url` import.
