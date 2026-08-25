# Privacidad

**Nada de lo que abras en MBZoo sale de tu dispositivo.**

- El visor es una aplicación web estática. Las copias se leen con la File API
  del navegador y se analizan dentro de un Web Worker en tu máquina. No existe
  ruta de subida: sin backend, sin telemetría, sin analíticas.
- El CLI solo lee ficheros locales.
- El contenido del curso puede contener datos personales (nombres, correos,
  entregas, calificaciones). MBZoo trata esos datos como tuyos: permanecen en
  memoria y cualquier futura función de exportación requerirá una acción
  explícita del usuario.
- Los recursos externos referenciados por el contenido del curso no se
  descargan automáticamente. Si una función futura necesitara red, será
  opcional y se documentará aquí primero.

Esto es una propiedad del producto, garantizada por la arquitectura
(despliegue estático, sin código de servidor), no solo una declaración.

[English](../PRIVACY.html)
