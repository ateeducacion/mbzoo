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

Copias legibles por máquinas de este sitio:
[llms.txt](https://ateeducacion.github.io/mbzoo/docs/llms.txt) (índice) y
[llms-full.txt](https://ateeducacion.github.io/mbzoo/docs/llms-full.txt)
(todas las páginas). Cada página HTML tiene un `.md` hermano y un control
**Copy Markdown**.

[Versión en inglés](../guide/research.html)

## Especímenes

El esquema dice lo que una copia *puede* contener; solo un fichero real dice
lo que una copia *contiene*. Por eso un parser escrito desde el fuente de
Moodle no está terminado hasta ejecutarlo contra una copia real, y los
especímenes vienen de cuatro sitios:

| Fuente | Para qué sirve |
|---|---|
| Copias institucionales (nunca commiteadas) | escala y formas del mundo real: cursos de 100+ actividades, exportaciones de eXeLearning, bancos de preguntas al azar |
| `saylordotorg/course_backups` (REPO-004) | corpus público de cursos con mucha página/url/etiqueta, y enlaces `$@…@$` |
| Los propios fixtures de test de Moodle (REPO-005) | formas que el core mantiene vivas: un paquete IMS real, una sección delegada real |
| Un curso generado en un Moodle real | lo que los corpus no traen: lección, consulta, base de datos, taller, rúbricas, y una copia hecha *con* datos de usuario |

Lo último cuesta unos diez minutos:

```bash
docker run -d --name mbzoo-spec -p 8123:8080 -e DB_TYPE=sqlite3 \
  -e MOODLE_ADMIN=admin -e MOODLE_ADMIN_PASSWORD='…' erseco/alpine-moodle
```

Después se construye el curso con las APIs de Moodle desde un script CLI y se
respalda con `backup_controller`, poniendo el ajuste `users` a un lado u otro.
Dos cosas que morderán si no: un script CLI no tiene sesión, así que
`add_moduleinfo()` necesita antes
`\core\session\manager::set_user(get_admin())`; y un `add_moduleinfo()` que
falla deja una transacción abierta que revierte todo lo creado después en la
misma petición.

Los especímenes se registran en `fixtures/manifest.yaml` con procedencia y
checksums, y **nunca se commitean**: las copias reales de instituciones o
personas no pertenecen a este repositorio, y un fichero regenerable no es
material de fixture.

Esta práctica ya se ha ganado el sueldo. Cinco parsers hechos desde el esquema
pasaban todos los tests sintéticos; la primera lección real destapó un bug en
todos ellos, donde un destino de salto cuyo id de página era 1 o 2 se leía
como una constante de Moodle que pertenece a otro campo.
