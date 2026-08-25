> For AI agents: the complete documentation index is available at /mbzoo/docs/llms.txt, the full documentation bundle is available at /mbzoo/docs/llms-full.txt, and this page is available as Markdown at /mbzoo/docs/es/guide/activity-support.md.

# Actividades y contenidos soportados

MBZoo renderiza lo que la copia contiene realmente y es transparente con lo
que no puede hacer. Los plugins de terceros desconocidos nunca rompen la
vista del curso.

| Módulo Moodle          | Inspeccionar          | Vista previa                  | Notas                                                                                                                                                                                                                                                                                       |
| ---------------------- | --------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Página (Page)          | ✅                     | ✅ HTML saneado                | ADR-0012/0013                                                                                                                                                                                                                                                                               |
| Etiqueta (Label)       | ✅                     | ✅ HTML saneado                |                                                                                                                                                                                                                                                                                             |
| URL                    | ✅                     | ✅ enlace externo              | nunca se descarga automáticamente                                                                                                                                                                                                                                                           |
| Recurso / Archivo      | ✅                     | ✅ vista integrada             | PDF con canvas pdf.js, imágenes, texto, HTML en sandbox (ADR-0014)                                                                                                                                                                                                                          |
| Carpeta (Folder)       | ✅                     | ✅ tarjetas de archivo         |                                                                                                                                                                                                                                                                                             |
| Página web con CSS+JS  | ✅                     | ✅ iframe en sandbox           | origen opaco + CSP; el JS queda aislado de la app (ADR-0014). Un sitio de varias páginas (p. ej. una exportación de eXeLearning) se recorre desde la lista de páginas de MBZoo, no siguiendo los enlaces dentro del iframe (ADR-0020)                                                       |
| Libro (Book)           | ✅ metadatos           | ✅ capítulos con navegación    | TOC + anterior/siguiente (ADR-0013)                                                                                                                                                                                                                                                         |
| Foro                   | ✅                     | ✅ resumen con tipo            | tipo de foro y ajustes; los debates solo existen si la copia incluyó usuarios                                                                                                                                                                                                               |
| Lección                | ✅                     | ✅ páginas ramificadas         | páginas, respuestas y a dónde salta cada una: todo viaja en una copia sin datos de usuario                                                                                                                                                                                                  |
| Consulta (Choice)      | ✅                     | ✅ pregunta + opciones         |                                                                                                                                                                                                                                                                                             |
| Base de datos          | ✅                     | ✅ esquema de campos           | los campos que recoge; las entradas solo existen con datos de usuario                                                                                                                                                                                                                       |
| Taller (Workshop)      | ✅                     | ✅ instrucciones + ejemplos    | envíos de ejemplo y ambos bloques de instrucciones; el trabajo entre pares es dato de usuario                                                                                                                                                                                               |
| Paquete IMS (imscp)    | ✅                     | ✅ índice + páginas en sandbox | índice leído del campo `structure` serializado en PHP (ADR-0021)                                                                                                                                                                                                                            |
| Chat · Wiki            | ✅                     | ✅ resumen con tipo            | horario / modo del wiki; mensajes y páginas son datos de usuario. El chat se marca como _retirado_: Moodle lo eliminó en 5.0 (MDL-82457)                                                                                                                                                    |
| Glosario               | ✅                     | ✅ entradas renderizadas       | concepto + definición; las entradas las escriben los usuarios, así que una copia hecha sin datos de usuario no trae ninguna y el visor lo indica                                                                                                                                            |
| Tarea (Assignment)     | ✅                     | ✅ resumen                     | fechas de entrega/cierre y tipos de entrega                                                                                                                                                                                                                                                 |
| Encuesta (Feedback)    | ✅                     | ✅ elementos renderizados      | etiquetas, preguntas y sus opciones en el orden del autor; las respuestas solo existen con datos de usuario                                                                                                                                                                                 |
| Cuestionario (Quiz)    | ✅ banco de preguntas  | ✅ inspección navegable        | preguntas con radios/checkboxes estilo Moodle; opción múltiple/verdadero-falso/respuesta corta/ensayo/relacionar; las preguntas al azar recorren el banco del que se sortean, indicando cuántas pide cada intento; la ejecución fiel requiere el Question Engine de Moodle — no es objetivo |
| SCORM                  | ✅ metadatos + paquete | ⏳ investigación               | lanzar requiere un runtime (candidato: scorm-again, Q-012)                                                                                                                                                                                                                                  |
| H5P                    | ✅ metadatos + paquete | ⏳ investigación               | candidato: h5p-standalone (Q-013)                                                                                                                                                                                                                                                           |
| eXeLearning .elp/.elpx | ✅ como archivos       | ⏳ investigación               | estudio de formato en Q-016                                                                                                                                                                                                                                                                 |
| Plugins desconocidos   | ✅                     | ✅ fallback de metadatos       | nunca rompen la vista del curso                                                                                                                                                                                                                                                             |

Leyenda: ✅ implementado · 🔜 planeado · ⏳ investigación (Q-012/Q-013/Q-016).

Los archivos de vídeo y audio se previsualizan en línea con los controles
nativos; un elemento multimedia decodifica su archivo pero nunca lo ejecuta.

## Datos personales

Una copia hecha **con usuarios** lleva un `users.xml` en la raíz con nombres,
nombres de usuario, correos, números de identificación, teléfonos, direcciones
postales, instituciones, la última IP desde la que entró cada cuenta y las
descripciones de perfil. MBZoo lo dice nada más abrir el archivo: cuántas
personas y qué tipos de dato están realmente rellenos. La lista de nombres
queda tras un desplegable cerrado, para que leerla sea un acto deliberado y no
algo que pasa mientras compartes pantalla.

De tu dispositivo no sale nada, pero el archivo sí. Trata una copia con datos
de usuario como datos personales antes de enviarla, subirla o commitearla.

## Calificación

El ítem de calificación de cada actividad viaja en una copia sin datos de
usuario, así que MBZoo muestra sobre cuánto va, qué nota aprueba, su peso y si
estaba oculta —leído de `grades.xml`, junto al payload del módulo—. Las notas
del alumnado (`<grade_grades>`) son datos de usuario y no se leen nunca.

Las rúbricas y guías de evaluación están en `grading.xml` y suelen ser la
declaración más clara de qué se evalúa: criterios, niveles y puntuaciones se
muestran completos. Un método de evaluación que MBZoo no descodifica se nombra
en vez de mostrarse vacío.

El libro de calificaciones del curso —árbol de categorías, agregación y letras—
se muestra en el panel de detalle antes de seleccionar una actividad.

## Módulos retirados

Moodle ha eliminado `chat` y `survey` del núcleo (5.0, MDL-82457) y
`assignment` (4.2, MDL-72350), así que ningún Moodle actual puede
restaurarlos, pero las copias anteriores a esas versiones siguen
llevándolos. MBZoo los lee como cualquier otro módulo y los marca como
_retirado_ junto al nombre del módulo, con la versión que los quitó.

## Enlaces del curso

Moodle no puede guardar URLs absolutas para los enlaces entre actividades, así
que la copia los lleva como fichas del tipo `$@COURSEVIEWBYID*62@$`. MBZoo las
descodifica (ADR-0019): un enlace a una actividad que viajó en la misma copia
abre esa actividad en MBZoo; el resto se convierte en un enlace etiquetado al
sitio que registra `<original_wwwroot>` —se abre en una pestaña nueva y MBZoo
nunca lo descarga—; y una ficha que MBZoo no sabe descodificar conserva su texto
pero no lleva a ninguna parte, en vez de fingir que apunta a algún sitio.

[English version](/mbzoo/docs/es/guide/activity-support.md)
