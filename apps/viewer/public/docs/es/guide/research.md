> For AI agents: the complete documentation index is available at /mbzoo/docs/llms.txt, the full documentation bundle is available at /mbzoo/docs/llms-full.txt, and this page is available as Markdown at /mbzoo/docs/es/guide/research.md.

# Sistema de investigación y evidencia

Cada afirmación durable en MBZoo traza a un registro registrado:

- `REPO-NNN` / `STD-NNN` / `TECH-NNN` — fuentes inspeccionadas
- `AN-NNN` — análisis (hechos vs interpretación)
- `EXP-NNN` — experimentos reproducibles (comandos, entorno, medidas)
- `ADR-NNNN` — decisiones de arquitectura (cuerpo de decisión legible;
  investigación en la Adenda; se sustituyen, nunca se reescriben)
- `TASK-NNN` / `Q-NNN` — trabajo seguido y preguntas abiertas

El sistema se valida automáticamente: `bun run research:validate` comprueba
IDs, metadatos requeridos y referencias cruzadas; `bun run research:indexes`
genera los índices (CI detecta desviaciones).

Ver [research/](https://github.com/ateeducacion/mbzoo/tree/main/research) en
el repositorio y `research/AGENTS.md` para las reglas operativas.

[Versión en inglés](/mbzoo/docs/es/guide/research.md)
