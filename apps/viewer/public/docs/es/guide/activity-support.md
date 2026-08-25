> For AI agents: the complete documentation index is available at /mbzoo/docs/llms.txt, the full documentation bundle is available at /mbzoo/docs/llms-full.txt, and this page is available as Markdown at /mbzoo/docs/es/guide/activity-support.md.

# Actividades y contenidos soportados

MBZoo renderiza lo que la copia contiene realmente y es transparente con lo
que no puede hacer. Los plugins de terceros desconocidos nunca rompen la
vista del curso.

| Módulo Moodle          | Inspeccionar          | Vista previa               | Notas                                                                                                                   |
| ---------------------- | --------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Página (Page)          | ✅                     | ✅ HTML saneado             | ADR-0012/0013                                                                                                           |
| Etiqueta (Label)       | ✅                     | ✅ HTML saneado             |                                                                                                                         |
| URL                    | ✅                     | ✅ enlace externo           | nunca se descarga automáticamente                                                                                       |
| Recurso / Archivo      | ✅                     | ✅ vista integrada          | PDF con canvas pdf.js, imágenes, texto, HTML en sandbox (ADR-0014)                                                      |
| Carpeta (Folder)       | ✅                     | ✅ tarjetas de archivo      |                                                                                                                         |
| Página web con CSS+JS  | ✅                     | ✅ iframe en sandbox        | origen opaco + CSP; el JS queda aislado de la app (ADR-0014)                                                            |
| Libro (Book)           | ✅ metadatos           | ✅ capítulos con navegación | TOC + anterior/siguiente (ADR-0015)                                                                                     |
| Foro                   | ✅ metadatos           | 🔜 planeado (solo lectura) | los debates solo existen si la copia incluyó usuarios                                                                   |
| Glosario               | ✅                     | ✅ entradas renderizadas    | concepto + definición                                                                                                   |
| Tarea (Assignment)     | ✅                     | ✅ resumen                  | fechas de entrega/cierre y tipos de entrega                                                                             |
| Cuestionario (Quiz)    | ✅ banco de preguntas  | ✅ inspección navegable     | preguntas con radios/checkboxes estilo Moodle; la ejecución fiel requiere el Question Engine de Moodle — no es objetivo |
| SCORM                  | ✅ metadatos + paquete | ⏳ investigación            | lanzar requiere un runtime (candidato: scorm-again, Q-012)                                                              |
| H5P                    | ✅ metadatos + paquete | ⏳ investigación            | candidato: h5p-standalone (Q-013)                                                                                       |
| eXeLearning .elp/.elpx | ✅ como archivos       | ⏳ investigación            | estudio de formato en Q-016                                                                                             |
| Plugins desconocidos   | ✅                     | ✅ fallback de metadatos    | nunca rompen la vista del curso                                                                                         |

Leyenda: ✅ implementado · 🔜 planeado · ⏳ investigación (Q-012/Q-013/Q-016).

[English version](/mbzoo/docs/es/guide/activity-support.md)
