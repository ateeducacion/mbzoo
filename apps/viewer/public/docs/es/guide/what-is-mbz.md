> For AI agents: the complete documentation index is available at /mbzoo/docs/llms.txt, the full documentation bundle is available at /mbzoo/docs/llms-full.txt, and this page is available as Markdown at /mbzoo/docs/es/guide/what-is-mbz.md.

# ¿Qué es un .mbz?

Un archivo `.mbz` es una **copia de seguridad de un curso Moodle**: un paquete
con las secciones, actividades, archivos, ajustes y (opcionalmente) datos de
usuario del curso.

## Formatos de contenedor

| Formato | Desde                                   | Notas                                                              |
| ------- | --------------------------------------- | ------------------------------------------------------------------ |
| ZIP     | Moodle 2.0                              | Sin soporte ZIP64 dentro del propio Moodle (tope práctico de 4 GB) |
| TAR.GZ  | por defecto desde 2.9 (opcional en 2.6) | ustar POSIX; sin límite de tamaño en la práctica                   |

MBZoo detecta el formato por los magic bytes y soporta **ambos**.

## Dentro del archivo

```
moodle_backup.xml          esqueleto curso/secciones/actividades
files.xml                  índice de archivos (contenthash, component, filearea…)
course/course.xml          metadatos completos del curso (el fullname vive aquí)
sections/section_N/        nombre, resumen y orden de actividades por sección
activities/<mod>_N/        XML por actividad (module.xml, <mod>.xml)
files/<2 hex>/<sha1>       almacén de archivos direccionado por contenido
```

Hechos verificados contra el código de Moodle (`moodle/moodle`, REPO-005) y
copias reales — ver `research/` en el repositorio.

## Qué hace MBZoo con ello

MBZoo analiza el subconjunto mínimo de XML necesario para reconstruir el árbol
de navegación del curso, y extrae el contenido (páginas, PDFs, webs,
preguntas…) **bajo demanda, en tu navegador**. Nada se sube — ver
[Privacidad](/mbzoo/docs/es/PRIVACY.md).
