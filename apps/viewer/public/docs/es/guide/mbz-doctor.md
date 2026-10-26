> For AI agents: the complete documentation index is available at /mbzoo/docs/llms.txt, the full documentation bundle is available at /mbzoo/docs/llms-full.txt.

# MBZ Doctor

MBZ Doctor examina una copia `.mbz` de Moodle en este dispositivo y, para
unos pocos problemas verificados, descarga una copia nueva. El archivo
original no se modifica.

Un archivo que vuelve a abrirse en MBZoo no es un archivo que Moodle haya
restaurado. Tras una reparación la herramienta dice:

> Archive and structural validation passed. Successful restoration in Moodle has not been verified.

La frase está en inglés a propósito en el informe técnico. En la interfaz
aparece traducida. Las comprobaciones estáticas no demuestran una
restauración.

## Analizar una copia

Abra la copia como siempre. **MBZ Doctor** aparece en la barra del curso.
El texto de ayuda es «Analiza esta copia de Moodle en busca de errores y
reparaciones posibles.»

Si el curso no se puede abrir pero el contenedor aún se puede listar, la
pantalla de error ofrece **Analizar el archivo**. Los fallos del contenedor
no necesitan el modelo completo del curso.

La versión de Moodle de destino es opcional. Si se deja vacía, un problema
que depende de la versión sigue siendo condicional y no se trata como un
error incondicional. Si se indica (por ejemplo `5.2`), la copia se compara
con esa versión. Un destino más antiguo es un aviso. La versión declarada
de la copia no se reescribe para saltarse esa comprobación: Moodle
ejecutaría el código de restauración equivocado.

**Analizar la copia** se ejecuta en el mismo worker de análisis. La página
sigue respondiendo. Cancelar detiene el análisis. Los hallazgos se filtran
por gravedad, categoría, posibilidad de reparación y actividad. **Mostrar
la actividad** solo aparece si esa actividad está en el curso abierto.

La gravedad es una palabra y una marca, no solo un color: crítico (●),
aviso (▲), nota (○).

| Posibilidad           | Significado                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Automática            | Se puede aplicar con **Reparar todos los problemas seguros**. No se elimina contenido escrito.                |
| Requiere confirmación | Hay que leer la vista previa. Si el cambio puede descartar o alterar registros, hace falta marcar la casilla. |
| Manual                | Solo diagnóstico. MBZoo no lo edita.                                                                          |
| No reparable          | La copia no contiene los bytes que faltan, o editarla ocultaría un problema peor.                             |

## Reparar y descargar

1. Seleccione una o más reparaciones, o pulse **Reparar todos los problemas seguros** (solo las automáticas).
2. **Previsualizar cambios** lista los archivos, las ediciones previstas y un extracto del XML antes y después. El extracto permanece en la página.
3. Aplique. Las reparaciones que requieren confirmación esperan a **Aplicar las reparaciones confirmadas**.
4. **Descargar MBZ reparado** guarda un archivo nuevo. `curso.mbz` pasa a ser `curso-repaired.mbz`. El nombre quita `.mbz`, `.zip`, `.tar.gz`, `.tgz` y `.gz` antes de añadir `-repaired.mbz`.
5. **Volver a analizar** examina ese archivo nuevo. El explorador del curso sigue mostrando el original hasta que usted abre la descarga.

Si una reparación falla, no se ofrece la descarga y el original no cambia.

La descarga es una copia de Moodle en el mismo tipo de contenedor (ZIP o
TAR.GZ). No es la exportación por actividad (XML, HTML o ZIP de archivos).

### Reparaciones admitidas

| Reparación                            | Cuándo se aplica                                                                                                                                                                                                                                                                                                              | Qué cambia                                                                                                                                                                        | Seguridad                                                                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tamaño de archivo declarado           | El SHA-1 de los bytes coincide con `contenthash` y `<filesize>` no coincide con esa longitud. No se reescriben los archivos excluidos por la copia, los registros de directorio (nombre `.`) ni las entradas por encima del límite de hash de 8 MiB.                                                                          | Solo el texto de `<filesize>`. Los bytes se quedan. Una segunda pasada no cambia nada.                                                                                            | Automática. Sin pérdida de contenido.                                                                                                                         |
| Caracteres de control ilegales en XML | La entrada contiene un código que XML 1.0 prohíbe (U+0000–U+0008, U+000B, U+000C, U+000E–U+001F, U+FFFE, U+FFFF). Tabulador, LF y CR se conservan.                                                                                                                                                                            | Se eliminan esos códigos. El marcado circundante, los elementos desconocidos y los comentarios se conservan.                                                                      | Requiere confirmación. Puede alterar texto escrito.                                                                                                           |
| Pregunta aleatoria moderna            | Véase más abajo. Si falla una precondición, no se edita nada.                                                                                                                                                                                                                                                                 | Los `question_reference` del cuestionario que apuntan a esa entrada del banco pasan a ser `question_set_reference`. Se elimina la entrada comodín. Las demás preguntas se quedan. | Requiere confirmación. La pérdida de contenido solo se marca cuando ningún hueco del cuestionario referencia el comodín, porque ese camino borra el registro. |
| Directorio extra alrededor de la raíz | Hay un solo `moodle_backup.xml`, todas las entradas comparten ese prefijo, los destinos siguen siendo únicos y seguros, y el archivo no tiene un fallo de integridad. Dos directorios anidados cuentan como un prefijo. Un archivo fuera del directorio, un segundo manifiesto, una ruta insegura o una colisión lo bloquean. | Cada ruta pierde ese prefijo. El XML y los bytes se copian. Los archivos de plugins se conservan.                                                                                 | Automática. Sin pérdida de contenido.                                                                                                                         |
| `roles.xml` vacío                     | El archivo no está, se pudo leer cada XML dentro del límite de hash y ningún archivo nombra un id de rol. Lo bloquean un rol referenciado, un XML ilegible o un `roles.xml` cuya raíz no es `roles_definition`.                                                                                                               | Añade `roles.xml` con raíz `roles_definition`. No se inventa ningún rol, nombre corto ni permiso.                                                                                 | Requiere confirmación. No entra en **Reparar todos los problemas seguros**. No se ha restaurado en Moodle (TASK-017).                                         |
| `questions.xml` vacío                 | El archivo no está y ningún XML analizado depende del banco (huecos de cuestionario, referencias, lecciones que nombran una pregunta, ids de `inforef` y las mismas etiquetas en XML de plugins).                                                                                                                             | Añade `questions.xml` con raíz `question_categories`. No se inventa ninguna categoría ni pregunta. No se borran cuestionarios para habilitar esta reparación.                     | Requiere confirmación. No entra en **Reparar todos los problemas seguros**. No se ha restaurado en Moodle (TASK-017).                                         |
| Contenido de archivo en otra ruta     | `files.xml` nombra un archivo físico cuya ruta `files/<2 hex>/<sha1>` no está, y otra entrada dentro del límite de hash tiene exactamente ese SHA-1. Los alias, los registros de directorio (nombre `.`), una entrada canónica en conflicto y un hash que no coincide se dejan como están.                                    | Copia esos bytes a la ruta canónica. La entrada original se queda. `files.xml` no se reescribe.                                                                                   | Automática. Sin pérdida de contenido.                                                                                                                         |

Una reparación que no cambia ningún byte no produce una descarga.

### Escritura del archivo

Las entradas que no cambian se copian. El ZIP resultante se almacena sin
compresión (método 0), así que puede ser mucho mayor que el original.
`ZipPassThrough` de fflate transporta bytes almacenados; no copia un flujo
deflate ya comprimido. Las fechas del ZIP nuevo son fijas
(`2023-11-14T00:00:00.000Z`) para que los bytes no dependan del reloj. El
TAR.GZ resultante es un ustar nuevo más gzip. Un TAR.GZ cuyo contenido sin
comprimir superaría 512 MiB se rechaza en lugar de truncarse. No hay
escritor ZIP64. Esto no es soporte para copias de tamaño arbitrario.

Estos contenedores rechazan la reconstrucción: archivo ilegible, ruta
insegura, ruta duplicada, suma de comprobación TAR incorrecta, CRC de ZIP
incorrecto, `moodle_backup.xml` ausente, más de una raíz de copia. El CRC
incorrecto se rechaza porque una reescritura guardaría los mismos bytes con
un CRC recién calculado y ocultaría el desajuste. Un único directorio
extra alrededor de `moodle_backup.xml` se quita solo cuando se cumple la
fila de arriba. Cualquier otro envoltorio sigue siendo un aviso.

## `qtype "random"`

Moodle 5.2 puede detener una restauración con:

```text
Coding error detected, it must be fixed by a programmer:
You cannot restore a question with qtype "random".
It must be converted to a set reference instead.
```

La excepción está en `restore_create_categories_and_questions::process_question`
en Moodle 5.2 y en `main`. Moodle 4.5 y 5.1 no la lanzan. El mismo código
de restauración ya aparta una pregunta aleatoria antigua y deja que el paso
del cuestionario convierta un `question_instance` viejo en una referencia a
un conjunto. Una copia que sigue ese camino está bien. MBZ Doctor la
informa como pregunta aleatoria heredada y no la reescribe.

No intente corregir el error así:

- bajando `moodle_release` o `backup_version`,
- borrando todas las preguntas aleatorias,
- renombrando `<qtype>random</qtype>` a otro tipo.

Cualquiera de esas acciones puede elegir el código de restauración
equivocado o eliminar el sorteo para el que se construyó el cuestionario.

### Cuándo se ofrece una reparación

Tiene que cumplirse todo esto:

- La versión de la copia es 4.0 o posterior, y el sello de `backup_version`
  falta o es al menos `20220202`. Una versión ausente y sin sello es un
  caso desconocido y no hay reparación. Una versión ausente con sello sigue
  el sello. Un destino anterior a 4.0 es un aviso de compatibilidad, no una
  reparación.
- La pregunta aleatoria es la única pregunta de su `question_bank_entry`.
- Su texto es exactamente `0` o `1` (`1` incluye subcategorías, que es como
  `qtype_random` guardaba la marca). Cualquier otro texto, incluida una
  frase, queda como **no se puede convertir con seguridad**.
- El elemento de la categoría tiene `contextid`. Ese valor se copia a
  `questionscontextid`. No se inventa ningún id de contexto.
- Los nombres de etiqueta no contienen comas. Moodle parte una etiqueta
  heredada por la primera coma.
- Cada hueco del cuestionario que referencia la entrada del banco ya tiene
  `usingcontextid`, `component` y `questionarea`, y no contiene ya un
  `question_set_reference`. Un hueco que solo tiene un id de pregunta no se
  convierte, y entonces se omite toda la reparación. No se inventa
  `usingcontextid`.

El filtro que se escribe es el JSON heredado que Moodle 4.3 a 5.2 ya
convierte:

```json
{ "questioncategoryid": 5, "includingsubcategories": 0 }
```

Las etiquetas, si las hay, se copian como `"0,name"`. El id de categoría es
un número JSON cuando es un entero seguro.

No se ha ejecutado en un sitio real si Moodle 4.0–4.2 guarda ese JSON tal
cual. Ningún proceso de Moodle ha restaurado un archivo escrito por esta
herramienta (TASK-017). Hasta que esa restauración quede registrada, trate
la reparación como una edición estructural con una forma documentada, y
restáurela en un curso desechable antes de usarla con estudiantes.

Un banco vacío es un aviso aparte. La herramienta no inventa preguntas
para llenarlo. Un hueco que apunta a un banco que esta copia no incluyó no
es lo mismo que un id roto: el banco puede existir en el sitio original.

## Qué sigue siendo solo diagnóstico

Las actividades, secciones, categorías de preguntas, bytes de archivo y XML
de plugins que faltan se informan y se conservan. Un módulo de terceros
desconocido no significa que falte en el destino: la copia no puede ver qué
plugins tiene instalados ese sitio. Los módulos retirados del núcleo (chat,
survey, el assignment antiguo) se nombran según la historia de Moodle. Si
el destino elegido es anterior a la retirada, el hallazgo es informativo.

Una copia más nueva que el destino que usted escribe es
`noticenewerbackup`. `restore_prechecks_helper::execute_prechecks` pone
esa cadena en la lista de avisos cuando `$CFG->version` es menor que el
`moodle_version` de la copia. Esa comprobación previa no aborta por sí
sola. Los pasos posteriores pueden fallar. La herramienta compara las
cadenas de versión que se pueden leer (`4.5`, `3.9`), lo que solo se
aproxima a la comparación numérica. La versión declarada no se reescribe.

Estos errores de restauración se diagnostican y no se reescriben:

| Identificador de Moodle                                                     | Qué hace MBZ Doctor                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `restoremultipletopcats`                                                    | Se informa cuando `backup_release` es 3.5 o posterior, los ocho primeros dígitos de `moodle_version` son posteriores a `20180205` y un contexto del banco tiene más de una categoría con padre `0`. Las categorías no se fusionan.                                |
| `questionattemptreferstomissingquestion`                                    | Se informa cuando `<states>` o `<sessions>` antiguos nombran un id de pregunta que no está en esta copia. Los intentos no se borran.                                                                                                                              |
| `questionattemptdatamissing`                                                | Se informa cuando ese intento antiguo tiene la pregunta pero le falta la sesión o los estados.                                                                                                                                                                    |
| `error_question_answers_missing_in_db`, `error_question_hint_missing_in_db` | No son un hallazgo del archivo. `restore_qtype_plugin` los lanza solo cuando la pregunta ya existe en el destino y el texto de una respuesta o de una pista no coincide. La copia no se edita para forzar la coincidencia.                                        |
| `unknown_context_mapping`                                                   | Se informa cuando el `contextid` de un archivo físico no aparece entre los contextos declarados fuera de `files.xml`, y ese conjunto no está vacío. No se inventa ningún contexto. Un análisis XML incompleto no lo emite.                                        |
| Ids de `inforef`                                                            | Se informa una referencia a un archivo, una pregunta o un rol que no está en esta copia, y también un id repetido. Que falte `inforef.xml` no es por sí mismo un error: `restore_load_included_inforef_records` carga el archivo solo si existe. No se sintetiza. |

`restoreuserconflict`, `restorecannotcreateuser` y
`restoremnethostidmismatch` dependen de las cuentas del destino. No se
editan nombres de usuario, correos, identificadores de autenticación, ids
de usuario, calificaciones, intentos ni entregas. `users.xml` no se copia
al informe.

`restorechecksumfailed` y `errorcopyingbackupfile` son fallos de sesión o
del servidor, no bytes dañados. La memoria de PHP, los tiempos de espera,
el tamaño de subida, el disco, los permisos, los plugins que faltan en el
servidor y el cron no se informan como contenido corrupto.
`errorminbackup20version` y `errorrestorefrontpagebackup` no se evitan
reescribiendo la versión o el tipo de curso. Un hash que no coincide con
sus bytes no se «arregla» guardando el hash nuevo. Un alias de archivo
externo no se sustituye por un archivo vacío.

No se descargan ni se reconstruyen URL externas, herramientas LTI,
bibliotecas H5P ni entornos SCORM. Un token `$@…@$` no se solicita. Una
actividad SCORM o H5P sin bytes empaquetados es un aviso, y solo cuando la
copia no desactivó la inclusión de archivos.

## Catálogo de reglas

Los identificadores, la gravedad y la posibilidad de reparación son los de
la [guía en inglés](/mbzoo/docs/guide/mbz-doctor.md). El texto que ve en la interfaz está
en español. Las frases en inglés del informe JSON viven en
`packages/core/src/doctor/catalog.ts`.

## Informes

**Descargar informe de diagnóstico** es JSON. Es texto técnico en inglés
generado por `@mbzoo/core`. **Descargar informe legible** sigue el idioma
de la página. Los dos omiten el enunciado de las preguntas, los bytes, las
contraseñas, los nombres de usuario y los correos. El XML de antes y
después permanece en pantalla y en el JSON se sustituye por `[omitted]`.

## Comprobar el resultado en Moodle

1. Restaure el archivo descargado en un curso desechable, en la versión de
   Moodle que realmente usa.
2. Abra la actividad que nombró el hallazgo. En una reparación de pregunta
   aleatoria, previsualice el cuestionario y confirme que el hueco sigue
   sorteando la misma categoría.
3. Si Moodle rechaza el archivo, conserve el original y el informe. No
   repita la misma reparación: una segunda pasada no encuentra nada que
   cambiar cuando la primera tuvo éxito.

Estas comprobaciones se han ejecutado en las pruebas unitarias de MBZoo y
en el navegador con copias sintéticas: ida y vuelta ZIP y TAR.GZ, la
reparación del tamaño, la de los caracteres ilegales, las precondiciones
de la pregunta aleatoria moderna, la negativa a reescribir una pregunta
aleatoria heredada de Moodle 3.x, quitar un directorio envoltorio, copiar
un contenido cuyo SHA-1 coincide, y los documentos vacíos `roles.xml` y
`questions.xml`. No se han ejecutado dentro de Moodle. Los documentos
vacíos siguen la raíz que escribe Moodle 5.2 y siguen requiriendo
confirmación porque ningún sitio desechable los ha restaurado (TASK-017).
El código comparado al diseñar las reglas: `restore_dbops`,
`restore_prechecks_helper`, `backup_stepslib`, `restore_stepslib` y
`restore_qtype_plugin` de Moodle 4.5 y 5.2, además de la forma de pregunta
de 3.x y el camino de la pregunta aleatoria de 4.0 a 5.2 en AN-009. Véase
AN-010 y ADR-0038.

## Privacidad

El análisis, la vista previa y las dos descargas permanecen en el
navegador. No se sube nada. Un informe puede nombrar rutas del archivo. No
publique un informe de una copia que contiene personas si esas rutas
identificarían un curso o a una persona. Véase
[Privacidad](/mbzoo/docs/es/PRIVACY.md).

[English](/mbzoo/docs/guide/mbz-doctor.md)
