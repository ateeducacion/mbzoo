# ¿Qué es un .mbz?

Un archivo `.mbz` es una **copia de seguridad de un curso Moodle**: un paquete
con las secciones, actividades, archivos, ajustes y (opcionalmente) datos de
usuario del curso.

## Formatos de contenedor

| Formato | Desde | Notas |
|---|---|---|
| ZIP | Moodle 2.0 | Sin soporte ZIP64 dentro del propio Moodle (tope práctico de 4 GB) |
| TAR.GZ | por defecto desde 2.9 (opcional en 2.6) | ustar POSIX; sin límite de tamaño en la práctica |

MBZoo detecta el formato por los magic bytes y soporta **ambos**.

## Dentro del archivo

```
moodle_backup.xml          esqueleto curso/secciones/actividades, y los
                           ajustes que deciden qué más hay aquí dentro
files.xml                  índice de archivos (contenthash, component, filearea…)
course/course.xml          metadatos completos del curso (el fullname vive aquí)
sections/section_N/        nombre, resumen y orden de actividades por sección
activities/<mod>_N/        XML por actividad — ver abajo
files/<2 hex>/<sha1>       almacén de archivos direccionado por contenido
questions.xml              el banco de preguntas, compartido por los cuestionarios
gradebook.xml              árbol de categorías, agregación, letras de calificación
users.xml                  las personas — solo si la copia se hizo con datos
                           de usuario (ver Privacidad)
```

Un directorio de actividad tiene más que su payload, y en los hermanos es
donde se esconden varias cosas:

```
activities/assign_42/
  assign.xml               ajustes y contenido propios del módulo
  module.xml               visibilidad, finalización, restricciones, etiquetas
  grades.xml               ítem de calificación: sobre cuánto, aprobado, peso
  grading.xml              rúbrica o guía de evaluación, si hay
  inforef.xml              qué registros de files.xml usa esta actividad
  calendar.xml roles.xml competencies.xml filters.xml
```

## El ajuste que lo decide todo

Lo más útil que se puede saber de un `.mbz` es si se hizo **con datos de
usuario**. Todos los módulos escriben su árbol XML completo en cualquier caso;
lo que el ajuste `users` condiciona es la *fuente de datos* de cada elemento.

Dos módulos que en el esquema parecen igual de ricos pueden ser mundos
distintos en un fichero real. Una `lección` escribe todas sus páginas y
respuestas sin condiciones: la unidad didáctica entera está ahí. Un `foro` no
escribe más que el registro del foro; cada debate y cada mensaje son datos de
usuario. Por eso un glosario vacío en una copia sin usuarios no es un fallo, y
por eso MBZoo dice *por qué* está vacío y no solo que lo está.

| Siempre en la copia | Solo con datos de usuario |
|---|---|
| páginas y respuestas de lección, opciones de consulta, campos de base de datos, instrucciones y ejemplos de taller, slots de cuestionario y banco de preguntas, ítems de calificación y rúbricas, estructura del libro de calificaciones | debates y mensajes de foro, entradas de glosario, registros de base de datos, páginas de wiki, mensajes de chat, entregas de tareas, intentos de cuestionario, las notas de todos |

## Enlaces que no llevan a ninguna parte

Una copia puede restaurarse en otro sitio, así que Moodle no puede guardar
URLs absolutas para los enlaces internos del curso. Los reescribe como fichas
`$@COURSEVIEWBYID*62@$` al hacer la copia y los descodifica al restaurar.
MBZoo no restaura nada, así que los descodifica para mostrarlos: navegación
interna cuando el destino viajó en la misma copia, y si no, un enlace
etiquetado al sitio del que salió la copia, que nunca se descarga (ADR-0019).

La misma gramática lleva `$@NULL@$`, que es el NULL de SQL serializado de
Moodle: un valor de campo, no un enlace, y nunca contenido.

Hechos verificados contra el código de Moodle (`moodle/moodle`, REPO-005) y
contra copias reales, incluidos cursos generados en un Moodle real para este
fin — ver `research/` en el repositorio.

## Qué hace MBZoo con ello

MBZoo analiza el subconjunto mínimo de XML necesario para reconstruir el árbol
de navegación del curso, y extrae el contenido (páginas, PDFs, webs,
preguntas…) **bajo demanda, en tu navegador**. Nada se sube — ver
[Privacidad](../PRIVACY.html).
