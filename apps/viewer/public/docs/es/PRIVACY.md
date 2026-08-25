> For AI agents: the complete documentation index is available at /mbzoo/docs/llms.txt, the full documentation bundle is available at /mbzoo/docs/llms-full.txt, and this page is available as Markdown at /mbzoo/docs/es/PRIVACY.md.

# Privacidad

**Nada de lo que abras en MBZoo sale de tu dispositivo.**

- El visor es una aplicación web estática. Las copias se leen con la File API
  del navegador y se analizan dentro de un Web Worker en tu máquina. No existe
  ruta de subida: sin backend, sin telemetría, sin analíticas.
- El CLI solo lee ficheros locales.
- Los recursos externos referenciados por el contenido del curso no se
  descargan automáticamente. Los enlaces del curso que Moodle reescribió como
  fichas `$@…@$` se descodifican y se ofrecen como enlaces, nunca se piden
  (ADR-0019). Si una función futura necesitara red, será opcional y se
  documentará aquí primero.

Esto es una propiedad del producto, garantizada por la arquitectura
(despliegue estático, sin código de servidor), no solo una declaración.

## Cuando una copia contiene personas

De tu dispositivo no sale nada, **pero el archivo sí**. Una copia de curso
hecha _con datos de usuario_ lleva un `users.xml` en la raíz, y no es una
lista de nombres. Un solo registro guarda:

> nombre de usuario · correo · nombre y apellidos · número de identificación ·
> dos teléfonos · institución · departamento · dirección postal · ciudad ·
> país · la última IP desde la que entró la cuenta · una descripción libre de
> perfil · asignaciones de rol

Los mensajes de foro, las entradas de glosario, las entregas de tareas, los
intentos de cuestionario y las calificaciones viajan igual cuando esa casilla
estaba marcada.

Por eso MBZoo lo dice nada más abrir un archivo así: **cuántas personas y qué
tipos de dato están realmente rellenos** — una columna que existe pero está
vacía para todos no se reporta, porque avisar de teléfonos cuando nadie tiene
enseña a la gente a ignorar el aviso.

La lista de nombres queda tras un desplegable que permanece cerrado. Saber que
un fichero nombra a cuatrocientas personas es lo que todo el mundo necesita;
leer sus nombres es un acto deliberado, y no de los que conviene hacer sin
querer mientras compartes pantalla. «Entendido» pliega el aviso en una línea
que mantiene a la vista el número de personas y los tipos de dato; esa elección
vive en memoria solo durante la sesión y nunca se escribe en el almacenamiento
del navegador.

**Trata una copia con datos de usuario como datos personales** antes de
enviarla por correo, subirla o commitearla a un repositorio.

## Exportaciones

La exportación por actividad (XML del módulo, contenido renderizado como HTML
independiente, archivos adjuntos en ZIP) es una acción deliberada: no se
escribe nada sin un clic, y el fichero se genera en tu navegador y va a tu
propia carpeta de descargas. Ver
[Soporte de actividades](/mbzoo/docs/es/guide/activity-support.md).

## Lo que este repositorio nunca contiene

Las copias reales de instituciones o personas nunca se commitean. Los fixtures
commiteados son sintéticos, deterministas y con checksum en
`fixtures/manifest.yaml`. Los especímenes reales usados para verificar los
parsers se registran ahí con su procedencia y se dejan fuera del árbol.

[English](/mbzoo/docs/PRIVACY.md)
