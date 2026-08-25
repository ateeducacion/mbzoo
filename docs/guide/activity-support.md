# Activity & content support

MBZoo renders what the backup actually contains, and is transparent about
what it cannot do. Unknown third-party plugins never break the course view.

| Moodle module | Inspect | Render / preview | Notes |
|---|---|---|---|
| Page | ✅ | ✅ sanitized HTML | ADR-0012/0013 |
| Label | ✅ | ✅ sanitized HTML | |
| URL | ✅ | ✅ external link | never fetched automatically |
| Resource / File | ✅ | ✅ inline preview | PDF via pdf.js canvas, images, text, sandboxed HTML (ADR-0014) |
| Folder | ✅ | ✅ file cards | |
| HTML page w/ CSS+JS | ✅ | ✅ sandboxed iframe | opaque origin + CSP; scripts isolated from the app (ADR-0014) |
| Book | ✅ metadata | 🔜 planned | chapters renderable from activity XML |
| Forum | ✅ metadata | 🔜 planned (read-only) | discussions only exist if backup included user data |
| Glossary | ✅ metadata | 🔜 planned (read-only) | |
| Assignment | ✅ metadata | 🔜 planned | submissions only present with user data |
| Quiz | ✅ metadata + question bank | 🔜 inspection-first | faithful execution requires Moodle's Question Engine — not a goal; practice mode is a separate idea (prompt §6) |
| SCORM | ✅ metadata + package file | ⏳ research | launch needs a runtime (scorm-again candidate, Q-012) in the sandbox |
| H5P | ✅ metadata + package file | ⏳ research | h5p-standalone candidate (Q-013) |
| eXeLearning .elp/.elpx | ✅ as files | ⏳ research | format study tracked in Q-016 |
| Unknown third-party plugins | ✅ | ✅ metadata fallback | never break the course view |

Legend: ✅ implemented · 🔜 planned next · ⏳ research (Q-012/Q-013/Q-016).

