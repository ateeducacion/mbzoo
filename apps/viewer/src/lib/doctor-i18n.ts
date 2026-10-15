/**
 * MBZ Doctor chrome and rule copy. The JSON report stays English in
 * @mbzoo/core; this table is what the viewer shows.
 */
const COPY = {
  'doctor.open': {
    en: 'MBZ Doctor',
    es: 'MBZ Doctor',
    fr: 'MBZ Doctor',
  },
  'doctor.openTitle': {
    en: 'Analyze this Moodle backup for errors and possible repairs.',
    es: 'Analiza esta copia de Moodle en busca de errores y reparaciones posibles.',
    fr: 'Analyser cette sauvegarde Moodle pour y trouver des erreurs et des réparations possibles.',
  },
  'doctor.errorOpen': {
    en: 'Analyze archive',
    es: 'Analizar el archivo',
    fr: 'Analyser l\u2019archive',
  },
  'doctor.errorOpenTitle': {
    en: 'Inspect this file for archive errors even though the course could not be opened.',
    es: 'Inspecciona este archivo aunque el curso no se haya podido abrir.',
    fr: 'Inspecter ce fichier même si le cours n\u2019a pas pu être ouvert.',
  },
  'doctor.title': {
    en: 'MBZ Doctor',
    es: 'MBZ Doctor',
    fr: 'MBZ Doctor',
  },
  'doctor.close': {
    en: 'Close',
    es: 'Cerrar',
    fr: 'Fermer',
  },
  'doctor.intro': {
    en: 'The scan stays on this device. The original file is never modified. A repair is a new download.',
    es: 'El análisis permanece en este dispositivo. El archivo original no se modifica. Una reparación es una descarga nueva.',
    fr: 'L\u2019analyse reste sur cet appareil. Le fichier d\u2019origine n\u2019est jamais modifié. Une réparation est un nouveau téléchargement.',
  },
  'doctor.target': {
    en: 'Target Moodle version',
    es: 'Versión de Moodle de destino',
    fr: 'Version Moodle cible',
  },
  'doctor.targetHint': {
    en: 'Optional. Example: 5.2. Leave blank so version-dependent issues stay conditional.',
    es: 'Opcional. Ejemplo: 5.2. Déjelo en blanco para que los problemas según la versión sigan siendo condicionales.',
    fr: 'Facultatif. Exemple : 5.2. Laisser vide pour que les problèmes liés à la version restent conditionnels.',
  },
  'doctor.analyze': {
    en: 'Analyze Backup',
    es: 'Analizar la copia',
    fr: 'Analyser la sauvegarde',
  },
  'doctor.cancel': {
    en: 'Cancel',
    es: 'Cancelar',
    fr: 'Annuler',
  },
  'doctor.progress': {
    en: 'Step {done} of {total}: {label}',
    es: 'Paso {done} de {total}: {label}',
    fr: 'Étape {done} sur {total} : {label}',
  },
  'doctor.progress.list': {
    en: 'Listing archive',
    es: 'Listando el archivo',
    fr: 'Listage de l\u2019archive',
  },
  'doctor.progress.manifest': {
    en: 'Reading manifest',
    es: 'Leyendo el manifiesto',
    fr: 'Lecture du manifeste',
  },
  'doctor.progress.structure': {
    en: 'Checking structure',
    es: 'Comprobando la estructura',
    fr: 'Vérification de la structure',
  },
  'doctor.progress.files': {
    en: 'Checking files',
    es: 'Comprobando los archivos',
    fr: 'Vérification des fichiers',
  },
  'doctor.progress.questions': {
    en: 'Checking questions',
    es: 'Comprobando las preguntas',
    fr: 'Vérification des questions',
  },
  'doctor.progress.done': {
    en: 'Finishing',
    es: 'Terminando',
    fr: 'Fin',
  },
  'doctor.facts.file': { en: 'File', es: 'Archivo', fr: 'Fichier' },
  'doctor.facts.format': { en: 'Archive', es: 'Contenedor', fr: 'Conteneur' },
  'doctor.facts.size': { en: 'Size', es: 'Tamaño', fr: 'Taille' },
  'doctor.facts.release': { en: 'Moodle release', es: 'Versión de Moodle', fr: 'Version Moodle' },
  'doctor.facts.version': { en: 'Moodle version', es: 'Versión interna', fr: 'Version interne' },
  'doctor.facts.backupVersion': {
    en: 'Backup version',
    es: 'Versión de la copia',
    fr: 'Version de sauvegarde',
  },
  'doctor.facts.date': { en: 'Backup date', es: 'Fecha de la copia', fr: 'Date de sauvegarde' },
  'doctor.facts.course': { en: 'Course', es: 'Curso', fr: 'Cours' },
  'doctor.facts.sections': { en: 'Sections', es: 'Secciones', fr: 'Sections' },
  'doctor.facts.activities': { en: 'Activities', es: 'Actividades', fr: 'Activités' },
  'doctor.facts.categories': {
    en: 'Question categories',
    es: 'Categorías de preguntas',
    fr: 'Catégories de questions',
  },
  'doctor.facts.questions': { en: 'Questions', es: 'Preguntas', fr: 'Questions' },
  'doctor.facts.files': {
    en: 'File records',
    es: 'Registros de archivos',
    fr: 'Fiches de fichiers',
  },
  'doctor.facts.users': { en: 'User data', es: 'Datos de usuario', fr: 'Données utilisateur' },
  'doctor.facts.filesIncluded': {
    en: 'Files included',
    es: 'Archivos incluidos',
    fr: 'Fichiers inclus',
  },
  'doctor.facts.target': { en: 'Target', es: 'Destino', fr: 'Cible' },
  'doctor.facts.unknown': {
    en: 'Not available until the scan finishes',
    es: 'No disponible hasta que termine el análisis',
    fr: 'Indisponible tant que l\u2019analyse n\u2019est pas terminée',
  },
  'doctor.facts.yes': { en: 'Yes', es: 'Sí', fr: 'Oui' },
  'doctor.facts.no': { en: 'No', es: 'No', fr: 'Non' },
  'doctor.facts.unset': { en: 'Not declared', es: 'No declarado', fr: 'Non déclaré' },
  'doctor.format.zip': { en: 'ZIP', es: 'ZIP', fr: 'ZIP' },
  'doctor.format.targz': { en: 'TAR.GZ', es: 'TAR.GZ', fr: 'TAR.GZ' },
  'doctor.format.unknown': { en: 'Unknown', es: 'Desconocido', fr: 'Inconnu' },
  'doctor.summary.critical': { en: 'Critical', es: 'Críticos', fr: 'Critiques' },
  'doctor.summary.warning': { en: 'Warnings', es: 'Avisos', fr: 'Avertissements' },
  'doctor.summary.info': { en: 'Notes', es: 'Notas', fr: 'Notes' },
  'doctor.summary.repairs': {
    en: 'Supported repairs',
    es: 'Reparaciones posibles',
    fr: 'Réparations possibles',
  },
  'doctor.summary.manual': { en: 'Manual', es: 'Manuales', fr: 'Manuelles' },
  'doctor.summary.external': { en: 'Needs Moodle', es: 'Requiere Moodle', fr: 'Exige Moodle' },
  'doctor.filter.severity': { en: 'Severity', es: 'Gravedad', fr: 'Gravité' },
  'doctor.filter.category': { en: 'Category', es: 'Categoría', fr: 'Catégorie' },
  'doctor.filter.repair': { en: 'Repair', es: 'Reparación', fr: 'Réparation' },
  'doctor.filter.activity': { en: 'Activity', es: 'Actividad', fr: 'Activité' },
  'doctor.filter.all': { en: 'All', es: 'Todas', fr: 'Toutes' },
  'doctor.severity.critical': { en: 'Critical', es: 'Crítico', fr: 'Critique' },
  'doctor.severity.warning': { en: 'Warning', es: 'Aviso', fr: 'Avertissement' },
  'doctor.severity.info': { en: 'Note', es: 'Nota', fr: 'Note' },
  'doctor.repair.automatic': { en: 'Automatic', es: 'Automática', fr: 'Automatique' },
  'doctor.repair.confirmation-required': {
    en: 'Needs confirmation',
    es: 'Requiere confirmación',
    fr: 'Confirmation requise',
  },
  'doctor.repair.manual': { en: 'Manual', es: 'Manual', fr: 'Manuelle' },
  'doctor.repair.not-repairable': {
    en: 'Not repairable',
    es: 'No reparable',
    fr: 'Non réparable',
  },
  'doctor.state.detected': { en: 'Detected', es: 'Detectado', fr: 'Détecté' },
  'doctor.state.repair-available': {
    en: 'Repair available',
    es: 'Reparación disponible',
    fr: 'Réparation disponible',
  },
  'doctor.state.repair-planned': { en: 'Planned', es: 'Planificada', fr: 'Planifiée' },
  'doctor.state.repaired': { en: 'Repaired', es: 'Reparada', fr: 'Réparée' },
  'doctor.state.verified-statically': {
    en: 'Checked in MBZoo',
    es: 'Comprobada en MBZoo',
    fr: 'Vérifiée dans MBZoo',
  },
  'doctor.state.verification-failed': {
    en: 'Check failed',
    es: 'Comprobación fallida',
    fr: 'Vérification échouée',
  },
  'doctor.state.external-verification-required': {
    en: 'Needs a Moodle restore',
    es: 'Requiere restaurar en Moodle',
    fr: 'Restauration Moodle requise',
  },
  'doctor.action.selected': {
    en: 'Repair Selected',
    es: 'Reparar lo seleccionado',
    fr: 'Réparer la sélection',
  },
  'doctor.action.safe': {
    en: 'Repair All Safe Issues',
    es: 'Reparar todos los problemas seguros',
    fr: 'Réparer tous les problèmes sûrs',
  },
  'doctor.action.preview': {
    en: 'Preview Changes',
    es: 'Previsualizar cambios',
    fr: 'Prévisualiser les changements',
  },
  'doctor.action.download': {
    en: 'Download Repaired MBZ',
    es: 'Descargar MBZ reparado',
    fr: 'Télécharger le MBZ réparé',
  },
  'doctor.action.reportJson': {
    en: 'Download Diagnostic Report',
    es: 'Descargar informe de diagnóstico',
    fr: 'Télécharger le rapport de diagnostic',
  },
  'doctor.action.reportText': {
    en: 'Download readable report',
    es: 'Descargar informe legible',
    fr: 'Télécharger le rapport lisible',
  },
  'doctor.action.reanalyze': {
    en: 'Reanalyze',
    es: 'Volver a analizar',
    fr: 'Analyser de nouveau',
  },
  'doctor.jsonNote': {
    en: 'The JSON report is English technical text. It omits question text, file bytes, passwords and personal data. The readable report uses the language of this page and also omits those previews.',
    es: 'El informe JSON es texto técnico en inglés. Omite el enunciado de las preguntas, los bytes de los archivos, las contraseñas y los datos personales. El informe legible usa el idioma de esta página y también omite esas vistas previas.',
    fr: 'Le rapport JSON est un texte technique en anglais. Il omet le texte des questions, les octets des fichiers, les mots de passe et les données personnelles. Le rapport lisible suit la langue de cette page et omet aussi ces aperçus.',
  },
  'doctor.empty': {
    en: 'No findings match these filters.',
    es: 'Ningún hallazgo coincide con estos filtros.',
    fr: 'Aucun résultat ne correspond à ces filtres.',
  },
  'doctor.noneYet': {
    en: 'Choose Analyze Backup to scan this file.',
    es: 'Elija Analizar la copia para examinar este archivo.',
    fr: 'Choisissez Analyser la sauvegarde pour examiner ce fichier.',
  },
  'doctor.selectRepair': {
    en: 'Select at least one repair.',
    es: 'Seleccione al menos una reparación.',
    fr: 'Sélectionnez au moins une réparation.',
  },
  'doctor.previewTitle': {
    en: 'Planned changes',
    es: 'Cambios previstos',
    fr: 'Changements prévus',
  },
  'doctor.preview.before': { en: 'Before', es: 'Antes', fr: 'Avant' },
  'doctor.preview.after': { en: 'After', es: 'Después', fr: 'Après' },
  'doctor.preview.loss': {
    en: 'This change can discard or alter backup records.',
    es: 'Este cambio puede descartar o alterar registros de la copia.',
    fr: 'Ce changement peut supprimer ou modifier des enregistrements de la sauvegarde.',
  },
  'doctor.preview.keep': {
    en: 'Other questions, activities and files stay.',
    es: 'El resto de preguntas, actividades y archivos se conserva.',
    fr: 'Les autres questions, activités et fichiers restent.',
  },
  'doctor.preview.reversible': {
    en: 'The original file stays as it is. Discard the download if you do not want it.',
    es: 'El archivo original permanece igual. Descarte la descarga si no la quiere.',
    fr: 'Le fichier d\u2019origine reste tel quel. Ignorez le téléchargement si vous n\u2019en voulez pas.',
  },
  'doctor.preview.why': { en: 'Why', es: 'Por qué', fr: 'Pourquoi' },
  'doctor.preview.entries': { en: 'Files', es: 'Archivos', fr: 'Fichiers' },
  'doctor.preview.local': {
    en: 'This preview stays in the page. Downloaded reports omit the before/after text.',
    es: 'Esta vista previa permanece en la página. Los informes descargados omiten el texto de antes y después.',
    fr: 'Cet aperçu reste dans la page. Les rapports téléchargés omettent le texte avant/après.',
  },
  'doctor.confirm.title': {
    en: 'Confirm content changes',
    es: 'Confirmar cambios de contenido',
    fr: 'Confirmer les changements de contenu',
  },
  'doctor.confirm.body': {
    en: 'These repairs change backup XML. Read the preview before continuing.',
    es: 'Estas reparaciones cambian el XML de la copia. Lea la vista previa antes de continuar.',
    fr: 'Ces réparations modifient le XML de la sauvegarde. Lisez l\u2019aperçu avant de continuer.',
  },
  'doctor.confirm.loss': {
    en: 'At least one selected repair removes or alters records. That can drop a placeholder question or illegal characters inside authored text.',
    es: 'Al menos una reparación seleccionada elimina o altera registros. Puede quitar una pregunta comodín o caracteres ilegales dentro de un texto escrito.',
    fr: 'Au moins une réparation sélectionnée retire ou modifie des enregistrements. Elle peut retirer une question fictive ou des caractères illégaux dans un texte rédigé.',
  },
  'doctor.confirm.check': {
    en: 'I understand this can change backup content.',
    es: 'Entiendo que esto puede cambiar el contenido de la copia.',
    fr: 'Je comprends que cela peut modifier le contenu de la sauvegarde.',
  },
  'doctor.confirm.apply': {
    en: 'Apply confirmed repairs',
    es: 'Aplicar las reparaciones confirmadas',
    fr: 'Appliquer les réparations confirmées',
  },
  'doctor.evidence': { en: 'Evidence', es: 'Evidencia', fr: 'Preuve' },
  'doctor.consequences': {
    en: 'What can happen',
    es: 'Qué puede ocurrir',
    fr: 'Ce qui peut arriver',
  },
  'doctor.sources': { en: 'Sources', es: 'Fuentes', fr: 'Sources' },
  'doctor.showActivity': {
    en: 'Show activity {id}',
    es: 'Mostrar la actividad {id}',
    fr: 'Afficher l\u2019activité {id}',
  },
  'doctor.done': {
    en: 'Analysis finished. {critical} critical, {warning} warnings, {info} notes.',
    es: 'Análisis terminado. {critical} críticos, {warning} avisos, {info} notas.',
    fr: 'Analyse terminée. {critical} critiques, {warning} avertissements, {info} notes.',
  },
  'doctor.repaired': {
    en: 'A new archive is ready. {note}',
    es: 'Hay un archivo nuevo listo. {note}',
    fr: 'Une nouvelle archive est prête. {note}',
  },
  'doctor.failed': {
    en: 'The operation stopped. The original file was not modified.',
    es: 'La operación se detuvo. El archivo original no se ha modificado.',
    fr: 'L\u2019opération s\u2019est arrêtée. Le fichier d\u2019origine n\u2019a pas été modifié.',
  },
  'doctor.limitations': { en: 'Limits', es: 'Límites', fr: 'Limites' },
  'doctor.applied': {
    en: 'Repairs applied',
    es: 'Reparaciones aplicadas',
    fr: 'Réparations appliquées',
  },
  'doctor.skipped': { en: 'Skipped', es: 'Omitidas', fr: 'Ignorées' },
  'doctor.remaining': {
    en: 'Still reported after the repair',
    es: 'Sigue apareciendo tras la reparación',
    fr: 'Encore signalé après la réparation',
  },
  'doctor.honesty': {
    en: 'Archive and structural validation passed. Successful restoration in Moodle has not been verified.',
    es: 'La validación del archivo y de la estructura ha pasado. La restauración correcta en Moodle no se ha comprobado.',
    fr: 'La validation de l\u2019archive et de la structure a réussi. La restauration dans Moodle n\u2019a pas été vérifiée.',
  },
  'doctor.category.archive': { en: 'Archive', es: 'Archivo', fr: 'Archive' },
  'doctor.category.xml': { en: 'XML', es: 'XML', fr: 'XML' },
  'doctor.category.metadata': { en: 'Metadata', es: 'Metadatos', fr: 'Métadonnées' },
  'doctor.category.course': { en: 'Course', es: 'Curso', fr: 'Cours' },
  'doctor.category.sections': { en: 'Sections', es: 'Secciones', fr: 'Sections' },
  'doctor.category.activities': { en: 'Activities', es: 'Actividades', fr: 'Activités' },
  'doctor.category.files': { en: 'Files', es: 'Archivos', fr: 'Fichiers' },
  'doctor.category.questions': { en: 'Questions', es: 'Preguntas', fr: 'Questions' },
  'doctor.category.plugins': { en: 'Plugins', es: 'Complementos', fr: 'Plugins' },
  'doctor.category.compatibility': {
    en: 'Compatibility',
    es: 'Compatibilidad',
    fr: 'Compatibilité',
  },
  'doctor.category.references': { en: 'References', es: 'Referencias', fr: 'Références' },
  'doctor.category.userdata': {
    en: 'User data',
    es: 'Datos de usuario',
    fr: 'Données utilisateur',
  },
  'doctor.category.environment': { en: 'Environment', es: 'Entorno', fr: 'Environnement' },
  'doctor.report.generated': { en: 'Generated', es: 'Generado', fr: 'Produit' },
  'doctor.report.privacy': {
    en: 'Paths may appear below. Question text, file bytes, passwords, usernames and email addresses are omitted.',
    es: 'Abajo pueden aparecer rutas. Se omiten el enunciado de las preguntas, los bytes, las contraseñas, los nombres de usuario y los correos.',
    fr: 'Des chemins peuvent figurer ci-dessous. Le texte des questions, les octets, les mots de passe, les identifiants et les adresses électroniques sont omis.',
  },
  'doctor.rule.archive.unreadable.title': {
    en: 'Archive cannot be opened safely',
    es: 'El archivo no se puede abrir con seguridad',
    fr: 'L\u2019archive ne peut pas être ouverte sans risque',
  },
  'doctor.rule.archive.unreadable.body': {
    en: 'The container could not be indexed. Repair is refused because a partial rebuild could drop or corrupt entries.',
    es: 'No se pudo indexar el contenedor. La reparación se rechaza porque una reconstrucción parcial podría perder o corromper entradas.',
    fr: 'Le conteneur n\u2019a pas pu être indexé. La réparation est refusée : une reconstruction partielle pourrait perdre ou corrompre des entrées.',
  },
  'doctor.rule.archive.extension.title': {
    en: 'File extension does not match the container',
    es: 'La extensión no coincide con el contenedor',
    fr: 'L\u2019extension ne correspond pas au conteneur',
  },
  'doctor.rule.archive.extension.body': {
    en: 'The format was detected from magic bytes. The extension is ignored for reading and is not rewritten.',
    es: 'El formato se detectó por los bytes mágicos. La extensión se ignora al leer y no se reescribe.',
    fr: 'Le format a été détecté par les octets magiques. L\u2019extension est ignorée à la lecture et n\u2019est pas réécrite.',
  },
  'doctor.rule.archive.missing-root.title': {
    en: 'moodle_backup.xml is missing',
    es: 'Falta moodle_backup.xml',
    fr: 'moodle_backup.xml est absent',
  },
  'doctor.rule.archive.missing-root.body': {
    en: 'A Moodle 2 backup keeps its course manifest at the archive root. Without it this is not a restorable backup.',
    es: 'Una copia de Moodle 2 guarda el manifiesto del curso en la raíz. Sin él no es una copia restaurable.',
    fr: 'Une sauvegarde Moodle 2 place le manifeste du cours à la racine. Sans lui, la sauvegarde n\u2019est pas restaurable.',
  },
  'doctor.rule.archive.enclosed.title': {
    en: 'Backup root is inside an extra directory',
    es: 'La raíz de la copia está dentro de un directorio extra',
    fr: 'La racine de la sauvegarde est dans un dossier supplémentaire',
  },
  'doctor.rule.archive.enclosed.body': {
    en: 'moodle_backup.xml is not at the archive root. A single enclosing directory can be unwrapped when every entry shares that directory and the archive is safe to rebuild. This finding stays when that proof is missing.',
    es: 'moodle_backup.xml no está en la raíz. Un único directorio envolvente se puede desenvolver cuando todas las entradas comparten ese directorio y el archivo se puede reconstruir con seguridad. Este aviso permanece cuando falta esa prueba.',
    fr: 'moodle_backup.xml n\u2019est pas à la racine. Un seul dossier enveloppant peut être retiré lorsque toutes les entrées partagent ce dossier et que l\u2019archive peut être reconstruite sans risque. Ce signal reste lorsque cette preuve manque.',
  },
  'doctor.rule.archive.unwrap-root.title': {
    en: 'Extra directory around the backup root',
    es: 'Directorio extra alrededor de la raíz de la copia',
    fr: 'Dossier supplémentaire autour de la racine',
  },
  'doctor.rule.archive.unwrap-root.body': {
    en: 'Every entry sits under one directory and moodle_backup.xml is the only manifest. The repair renames those paths so the manifest is at the archive root. File bytes and XML are copied unchanged.',
    es: 'Todas las entradas están bajo un directorio y moodle_backup.xml es el único manifiesto. La reparación renombra esas rutas para dejar el manifiesto en la raíz. Los bytes y el XML se copian sin cambios.',
    fr: 'Toutes les entrées sont sous un seul dossier et moodle_backup.xml est le seul manifeste. La réparation renomme ces chemins pour placer le manifeste à la racine. Les octets et le XML sont copiés tels quels.',
  },
  'doctor.rule.archive.multiple-roots.title': {
    en: 'More than one backup manifest',
    es: 'Hay más de un manifiesto',
    fr: 'Plusieurs manifestes de sauvegarde',
  },
  'doctor.rule.archive.multiple-roots.body': {
    en: 'Several moodle_backup.xml entries are present. MBZoo will not choose one and discard the others.',
    es: 'Hay varias entradas moodle_backup.xml. MBZoo no elige una y descarta las demás.',
    fr: 'Plusieurs entrées moodle_backup.xml sont présentes. MBZoo n\u2019en choisit pas une en écartant les autres.',
  },
  'doctor.rule.archive.unsafe-path.title': {
    en: 'Unsafe archive path',
    es: 'Ruta de archivo insegura',
    fr: 'Chemin d\u2019archive dangereux',
  },
  'doctor.rule.archive.unsafe-path.body': {
    en: 'An entry name is absolute or contains "..". It is not extracted and a rebuild will not copy it.',
    es: 'Un nombre de entrada es absoluto o contiene "..". No se extrae y una reconstrucción no lo copia.',
    fr: 'Un nom d\u2019entrée est absolu ou contient « .. ». Il n\u2019est pas extrait et une reconstruction ne le copie pas.',
  },
  'doctor.rule.archive.duplicate-path.title': {
    en: 'Duplicate archive path',
    es: 'Ruta de archivo duplicada',
    fr: 'Chemin d\u2019archive en double',
  },
  'doctor.rule.archive.duplicate-path.body': {
    en: 'Two entries share one path. A rebuild would have to drop one of them, so it is refused.',
    es: 'Dos entradas comparten una ruta. Una reconstrucción tendría que descartar una, así que se rechaza.',
    fr: 'Deux entrées partagent un chemin. Une reconstruction devrait en abandonner une, donc elle est refusée.',
  },
  'doctor.rule.archive.checksum.title': {
    en: 'TAR header checksum does not match',
    es: 'La suma de comprobación de la cabecera TAR no coincide',
    fr: 'La somme de contrôle de l\u2019en-tête TAR ne correspond pas',
  },
  'doctor.rule.archive.checksum.body': {
    en: 'The ustar checksum field does not match the header bytes. The entry is still listed, and a rebuild is refused.',
    es: 'El campo de suma ustar no coincide con la cabecera. La entrada se lista y la reconstrucción se rechaza.',
    fr: 'Le champ de somme ustar ne correspond pas à l\u2019en-tête. L\u2019entrée reste listée et la reconstruction est refusée.',
  },
  'doctor.rule.archive.crc.title': {
    en: 'ZIP CRC does not match the entry bytes',
    es: 'El CRC del ZIP no coincide con los bytes',
    fr: 'Le CRC du ZIP ne correspond pas aux octets',
  },
  'doctor.rule.archive.crc.body': {
    en: 'The central-directory CRC-32 does not match the uncompressed bytes. Those bytes are left unchanged.',
    es: 'El CRC-32 del directorio central no coincide con los bytes sin comprimir. Esos bytes no se tocan.',
    fr: 'Le CRC-32 du répertoire central ne correspond pas aux octets décompressés. Ces octets restent inchangés.',
  },
  'doctor.rule.archive.ratio.title': {
    en: 'Suspicious compression ratio',
    es: 'Relación de compresión sospechosa',
    fr: 'Taux de compression suspect',
  },
  'doctor.rule.archive.ratio.body': {
    en: 'An entry expands far beyond its compressed size. It was not fully expanded during this check.',
    es: 'Una entrada se expande mucho más que su tamaño comprimido. Esta comprobación no la expandió por completo.',
    fr: 'Une entrée se décompresse bien au-delà de sa taille compressée. Ce contrôle ne l\u2019a pas entièrement développée.',
  },
  'doctor.rule.xml.malformed.title': {
    en: 'XML is not well-formed',
    es: 'El XML no está bien formado',
    fr: 'Le XML n\u2019est pas bien formé',
  },
  'doctor.rule.xml.malformed.body': {
    en: 'A strict parse failed. MBZoo will not guess a tree or drop unknown elements to make it parse.',
    es: 'El análisis estricto falló. MBZoo no inventa un árbol ni elimina elementos desconocidos para que encaje.',
    fr: 'Une analyse stricte a échoué. MBZoo n\u2019invente pas un arbre et ne retire pas les éléments inconnus pour forcer l\u2019analyse.',
  },
  'doctor.rule.xml.utf8.title': {
    en: 'XML is not valid UTF-8',
    es: 'El XML no es UTF-8 válido',
    fr: 'Le XML n\u2019est pas de l\u2019UTF-8 valide',
  },
  'doctor.rule.xml.utf8.body': {
    en: 'The entry is not valid UTF-8, so it was not edited.',
    es: 'La entrada no es UTF-8 válido, así que no se editó.',
    fr: 'L\u2019entrée n\u2019est pas de l\u2019UTF-8 valide, donc elle n\u2019a pas été modifiée.',
  },
  'doctor.rule.xml.limit.title': {
    en: 'XML exceeds the safety limit',
    es: 'El XML supera el límite de seguridad',
    fr: 'Le XML dépasse la limite de sécurité',
  },
  'doctor.rule.xml.limit.body': {
    en: 'The entry is larger than the XML parse ceiling, so it was not parsed or edited.',
    es: 'La entrada supera el tope de análisis XML, así que no se analizó ni se editó.',
    fr: 'L\u2019entrée dépasse le plafond d\u2019analyse XML, donc elle n\u2019a été ni analysée ni modifiée.',
  },
  'doctor.rule.xml.illegal-chars.title': {
    en: 'Illegal XML control characters',
    es: 'Caracteres de control XML ilegales',
    fr: 'Caractères de contrôle XML illégaux',
  },
  'doctor.rule.xml.illegal-chars.body': {
    en: 'The entry contains XML 1.0-forbidden control characters. Removing them changes those bytes and needs confirmation. Other markup is kept.',
    es: 'La entrada contiene caracteres de control prohibidos en XML 1.0. Quitarlos cambia esos bytes y exige confirmación. El resto del marcado se conserva.',
    fr: 'L\u2019entrée contient des caractères de contrôle interdits en XML 1.0. Les retirer change ces octets et demande une confirmation. Le reste du balisage est conservé.',
  },
  'doctor.rule.metadata.no-target.title': {
    en: 'No target Moodle version selected',
    es: 'No hay versión de Moodle de destino',
    fr: 'Aucune version Moodle cible',
  },
  'doctor.rule.metadata.no-target.body': {
    en: 'Version-dependent incompatibilities stay conditional. They are not treated as unconditional errors.',
    es: 'Las incompatibilidades que dependen de la versión siguen siendo condicionales. No se tratan como errores absolutos.',
    fr: 'Les incompatibilités liées à la version restent conditionnelles. Elles ne sont pas traitées comme des erreurs absolues.',
  },
  'doctor.rule.metadata.target-older.title': {
    en: 'Target Moodle is older than the backup',
    es: 'El Moodle de destino es más antiguo que la copia',
    fr: 'Le Moodle cible est plus ancien que la sauvegarde',
  },
  'doctor.rule.metadata.target-older.body': {
    en: 'The backup release is newer than the target you entered. Moodle records noticenewerbackup as a warning in restore_prechecks_helper::execute_prechecks when the site version is lower than the backup moodle_version. That precheck does not itself abort the restore. Later steps can still fail, and the result depends on the structures in the backup. This comparison uses the release strings, which approximate that numeric check. The declared version is never rewritten.',
    es: 'La versión de la copia es más nueva que el destino indicado. Moodle registra noticenewerbackup como aviso en restore_prechecks_helper::execute_prechecks cuando la versión del sitio es menor que moodle_version de la copia. Esa comprobación previa no aborta la restauración por sí sola. Los pasos posteriores pueden fallar, y el resultado depende de las estructuras de la copia. Esta comparación usa las cadenas de versión, que se aproximan a esa comprobación numérica. La versión declarada no se reescribe.',
    fr: 'La version de la sauvegarde est plus récente que la cible indiquée. Moodle enregistre noticenewerbackup comme avertissement dans restore_prechecks_helper::execute_prechecks lorsque la version du site est inférieure à moodle_version de la sauvegarde. Ce précontrôle n\u2019interrompt pas la restauration à lui seul. Les étapes suivantes peuvent échouer, et le résultat dépend des structures de la sauvegarde. Cette comparaison utilise les chaînes de version, qui approchent ce contrôle numérique. La version déclarée n\u2019est jamais réécrite.',
  },
  'doctor.rule.metadata.missing-roles.title': {
    en: 'roles.xml is missing',
    es: 'Falta roles.xml',
    fr: 'roles.xml est absent',
  },
  'doctor.rule.metadata.missing-roles.body': {
    en: 'restore_dbops::load_roles_to_tempids throws missing_roles_xml_file when the root roles.xml file is absent. Moodle writes roles_definition even when there are no roles. An empty file is offered only when every scanned XML file has no role id. It has not been restored in Moodle.',
    es: 'restore_dbops::load_roles_to_tempids lanza missing_roles_xml_file cuando falta roles.xml en la raíz. Moodle escribe roles_definition aunque no haya roles. Un archivo vacío solo se ofrece cuando ningún XML analizado cita un id de rol. No se ha restaurado en Moodle.',
    fr: 'restore_dbops::load_roles_to_tempids lève missing_roles_xml_file lorsque roles.xml est absent à la racine. Moodle écrit roles_definition même sans rôles. Un fichier vide n\u2019est proposé que si aucun XML analysé ne cite d\u2019identifiant de rôle. Il n\u2019a pas été restauré dans Moodle.',
  },
  'doctor.rule.sections.missing.title': {
    en: 'Section XML is missing',
    es: 'Falta el XML de la sección',
    fr: 'Le XML de section est absent',
  },
  'doctor.rule.sections.missing.body': {
    en: 'moodle_backup.xml lists a section whose section.xml is not in the archive. The declaration is kept.',
    es: 'moodle_backup.xml cita una sección cuyo section.xml no está en el archivo. La declaración se conserva.',
    fr: 'moodle_backup.xml cite une section dont le section.xml n\u2019est pas dans l\u2019archive. La déclaration est conservée.',
  },
  'doctor.rule.sections.cycle.title': {
    en: 'Section parent cycle',
    es: 'Ciclo de secciones padre',
    fr: 'Cycle de sections parentes',
  },
  'doctor.rule.sections.cycle.body': {
    en: 'Course-format parent links loop. The hierarchy is not flattened and no parent is deleted.',
    es: 'Los enlaces de padre del formato del curso forman un ciclo. La jerarquía no se aplana y no se borra ningún padre.',
    fr: 'Les liens de parent du format de cours forment une boucle. La hiérarchie n\u2019est pas aplatie et aucun parent n\u2019est supprimé.',
  },
  'doctor.rule.activities.missing.title': {
    en: 'Declared activity is missing',
    es: 'Falta una actividad declarada',
    fr: 'Une activité déclarée est absente',
  },
  'doctor.rule.activities.missing.body': {
    en: 'moodle_backup.xml lists an activity directory that is not in the archive. The declaration is not removed.',
    es: 'moodle_backup.xml cita un directorio de actividad que no está en el archivo. La declaración no se elimina.',
    fr: 'moodle_backup.xml cite un dossier d\u2019activité absent de l\u2019archive. La déclaration n\u2019est pas retirée.',
  },
  'doctor.rule.activities.missing-module.title': {
    en: 'module.xml is missing',
    es: 'Falta module.xml',
    fr: 'module.xml est absent',
  },
  'doctor.rule.activities.missing-module.body': {
    en: 'The activity directory has no module.xml. It is not deleted.',
    es: 'El directorio de la actividad no tiene module.xml. No se elimina.',
    fr: 'Le dossier de l\u2019activité n\u2019a pas de module.xml. Il n\u2019est pas supprimé.',
  },
  'doctor.rule.activities.undeclared.title': {
    en: 'Activity directory is not in the manifest',
    es: 'El directorio de la actividad no está en el manifiesto',
    fr: 'Le dossier d\u2019activité n\u2019est pas dans le manifeste',
  },
  'doctor.rule.activities.undeclared.body': {
    en: 'An activities/ directory is present but moodle_backup.xml does not list it. It is left in place.',
    es: 'Hay un directorio activities/ que moodle_backup.xml no cita. Se deja donde está.',
    fr: 'Un dossier activities/ est présent alors que moodle_backup.xml ne le cite pas. Il est laissé en place.',
  },
  'doctor.rule.activities.duplicate.title': {
    en: 'Duplicate activity id',
    es: 'Identificador de actividad duplicado',
    fr: 'Identifiant d\u2019activité en double',
  },
  'doctor.rule.activities.duplicate.body': {
    en: 'Two manifest entries share one module id.',
    es: 'Dos entradas del manifiesto comparten un identificador de módulo.',
    fr: 'Deux entrées du manifeste partagent un identifiant de module.',
  },
  'doctor.rule.activities.bad-section.title': {
    en: 'Activity points at a missing section',
    es: 'La actividad apunta a una sección que no existe',
    fr: 'L\u2019activité pointe vers une section absente',
  },
  'doctor.rule.activities.bad-section.body': {
    en: 'The activity sectionid is not in the manifest section list. The reference is kept.',
    es: 'El sectionid de la actividad no está en la lista de secciones. La referencia se conserva.',
    fr: 'Le sectionid de l\u2019activité n\u2019est pas dans la liste des sections. La référence est conservée.',
  },
  'doctor.rule.files.excluded.title': {
    en: 'File content was excluded from the backup',
    es: 'El contenido de los archivos se excluyó de la copia',
    fr: 'Le contenu des fichiers a été exclu de la sauvegarde',
  },
  'doctor.rule.files.excluded.body': {
    en: 'The root files setting is off. Missing file bytes are expected and are not reported as corruption.',
    es: 'El ajuste de archivos de la raíz está desactivado. La ausencia de bytes es esperable y no se informa como corrupción.',
    fr: 'Le réglage racine des fichiers est désactivé. L\u2019absence d\u2019octets est attendue et n\u2019est pas signalée comme une corruption.',
  },
  'doctor.rule.files.missing.title': {
    en: 'File bytes are missing',
    es: 'Faltan los bytes del archivo',
    fr: 'Les octets du fichier sont absents',
  },
  'doctor.rule.files.missing.body': {
    en: 'files.xml points at a content hash that is not in the archive, and the backup included files. No empty placeholder is written.',
    es: 'files.xml apunta a un hash que no está en el archivo, y la copia incluía archivos. No se escribe un sustituto vacío.',
    fr: 'files.xml pointe vers un hash absent de l\u2019archive, et la sauvegarde incluait les fichiers. Aucun fichier vide n\u2019est écrit.',
  },
  'doctor.rule.files.hash.title': {
    en: 'Content hash does not match the bytes',
    es: 'El hash del contenido no coincide con los bytes',
    fr: 'Le hash du contenu ne correspond pas aux octets',
  },
  'doctor.rule.files.hash.body': {
    en: 'The stored bytes hash to a different SHA-1 than files.xml declares. The record and the bytes are both kept.',
    es: 'Los bytes almacenados dan un SHA-1 distinto del que declara files.xml. Se conservan el registro y los bytes.',
    fr: 'Les octets stockés donnent un SHA-1 différent de celui déclaré dans files.xml. La fiche et les octets sont conservés.',
  },
  'doctor.rule.files.size.title': {
    en: 'Declared file size does not match the bytes',
    es: 'El tamaño declarado no coincide con los bytes',
    fr: 'La taille déclarée ne correspond pas aux octets',
  },
  'doctor.rule.files.size.body': {
    en: 'The SHA-1 matches the entry, so the byte length in files.xml can be set to the length of those bytes. The bytes are not replaced.',
    es: 'El SHA-1 coincide, así que la longitud en files.xml puede igualarse a la de esos bytes. Los bytes no se sustituyen.',
    fr: 'Le SHA-1 correspond, donc la longueur dans files.xml peut être alignée sur ces octets. Les octets ne sont pas remplacés.',
  },
  'doctor.rule.files.hash-skipped.title': {
    en: 'Large file was not hashed',
    es: 'Un archivo grande no se ha comprobado por hash',
    fr: 'Un gros fichier n\u2019a pas été haché',
  },
  'doctor.rule.files.hash-skipped.body': {
    en: 'The entry is above the doctor hash budget. Its SHA-1 was not recomputed.',
    es: 'La entrada supera el límite de hash. No se recalculó su SHA-1.',
    fr: 'L\u2019entrée dépasse le budget de hash. Son SHA-1 n\u2019a pas été recalculé.',
  },
  'doctor.rule.files.recover-misplaced-content.title': {
    en: 'File payload is not at its content-hash path',
    es: 'El contenido del archivo no está en la ruta de su hash',
    fr: 'Le contenu du fichier n\u2019est pas sur le chemin de son hash',
  },
  'doctor.rule.files.recover-misplaced-content.body': {
    en: 'files.xml names a SHA-1 whose canonical files/<2 hex>/<sha1> path is missing, and another archive entry has those exact bytes. The repair copies them to the pool path and leaves the original entry in place. files.xml is not rewritten.',
    es: 'files.xml nombra un SHA-1 cuya ruta files/<2 hex>/<sha1> no está, y otra entrada del archivo tiene exactamente esos bytes. La reparación los copia a la ruta del almacén y deja la entrada original. files.xml no se reescribe.',
    fr: 'files.xml nomme un SHA-1 dont le chemin files/<2 hex>/<sha1> est absent, et une autre entrée contient exactement ces octets. La réparation les copie vers le chemin du dépôt et conserve l\u2019entrée d\u2019origine. files.xml n\u2019est pas réécrit.',
  },
  'doctor.rule.files.recovery-incomplete.title': {
    en: 'File recovery search was not finished',
    es: 'La búsqueda de recuperación no terminó',
    fr: 'La recherche de récupération n\u2019est pas terminée',
  },
  'doctor.rule.files.recovery-incomplete.body': {
    en: 'A referenced payload is not at its canonical path. At least one other entry is above the hash budget, so its SHA-1 was not computed. The file is not reported as missing content.',
    es: 'Un contenido referenciado no está en su ruta canónica. Al menos otra entrada supera el límite de hash, así que no se calculó su SHA-1. No se informa como contenido ausente.',
    fr: 'Un contenu référencé n\u2019est pas sur son chemin canonique. Au moins une autre entrée dépasse le budget de hash, donc son SHA-1 n\u2019a pas été calculé. Il n\u2019est pas signalé comme contenu manquant.',
  },
  'doctor.rule.files.unreferenced.title': {
    en: 'Archive file has no files.xml record',
    es: 'Un archivo del contenedor no tiene ficha en files.xml',
    fr: 'Un fichier de l\u2019archive n\u2019a pas de fiche dans files.xml',
  },
  'doctor.rule.files.unreferenced.body': {
    en: 'A files/ payload has no matching content hash in files.xml. It is kept. It is not treated as safe to delete.',
    es: 'Un contenido en files/ no tiene hash en files.xml. Se conserva. No se considera seguro borrarlo.',
    fr: 'Un contenu dans files/ n\u2019a pas de hash dans files.xml. Il est conservé. Le supprimer n\u2019est pas considéré comme sûr.',
  },
  'doctor.rule.questions.legacy-random.title': {
    en: 'Legacy random question (Moodle restores this)',
    es: 'Pregunta aleatoria heredada (Moodle la restaura)',
    fr: 'Question aléatoire ancienne (Moodle la restaure)',
  },
  'doctor.rule.questions.legacy-random.body': {
    en: 'This backup takes the pre-4.0 question path. Moodle stashes qtype random and converts the quiz slot. Rewriting it here would bypass that path.',
    es: 'Esta copia sigue la ruta de preguntas anterior a 4.0. Moodle guarda qtype random y convierte el espacio del cuestionario. Reescribirlo aquí saltaría esa ruta.',
    fr: 'Cette sauvegarde suit le chemin des questions d\u2019avant la 4.0. Moodle met de côté qtype random et convertit l\u2019emplacement du test. Le réécrire ici contournerait ce chemin.',
  },
  'doctor.rule.questions.random-modern.title': {
    en: 'Random question in a modern question bank',
    es: 'Pregunta aleatoria en un banco moderno',
    fr: 'Question aléatoire dans une banque moderne',
  },
  'doctor.rule.questions.random-modern.body': {
    en: 'Moodle 5.2 refuses to insert qtype random on this path. The repair turns the quiz slot reference into a question set reference and removes only that placeholder entry.',
    es: 'Moodle 5.2 se niega a insertar qtype random en esta ruta. La reparación convierte la referencia del espacio en una referencia de conjunto y quita solo esa entrada comodín.',
    fr: 'Moodle 5.2 refuse d\u2019insérer qtype random sur ce chemin. La réparation transforme la référence de l\u2019emplacement en référence d\u2019ensemble et ne retire que cette entrée fictive.',
  },
  'doctor.rule.questions.random-blocked.title': {
    en: 'Random question cannot be converted safely',
    es: 'La pregunta aleatoria no se puede convertir con seguridad',
    fr: 'La question aléatoire ne peut pas être convertie sans risque',
  },
  'doctor.rule.questions.random-blocked.body': {
    en: 'The category context, the slot reference, or neighbouring versions are not unambiguous. No question is deleted and no id is invented.',
    es: 'El contexto de la categoría, la referencia del espacio o las versiones vecinas no son unívocos. No se borra ninguna pregunta ni se inventa ningún id.',
    fr: 'Le contexte de catégorie, la référence d\u2019emplacement ou les versions voisines ne sont pas univoques. Aucune question n\u2019est supprimée et aucun id n\u2019est inventé.',
  },
  'doctor.rule.questions.category-cycle.title': {
    en: 'Question category cycle',
    es: 'Ciclo de categorías de preguntas',
    fr: 'Cycle de catégories de questions',
  },
  'doctor.rule.questions.category-cycle.body': {
    en: 'Category parent links loop. No parent is rewritten.',
    es: 'Los padres de las categorías forman un ciclo. No se reescribe ningún padre.',
    fr: 'Les parents de catégories forment une boucle. Aucun parent n\u2019est réécrit.',
  },
  'doctor.rule.questions.missing-parent.title': {
    en: 'Question category parent is missing',
    es: 'Falta el padre de una categoría de preguntas',
    fr: 'Le parent d\u2019une catégorie de questions est absent',
  },
  'doctor.rule.questions.missing-parent.body': {
    en: 'A category parent id is not in this backup and is not the root. No parent is invented.',
    es: 'El id del padre no está en esta copia y no es la raíz. No se inventa un padre.',
    fr: 'L\u2019id du parent n\u2019est pas dans cette sauvegarde et ce n\u2019est pas la racine. Aucun parent n\u2019est inventé.',
  },
  'doctor.rule.questions.empty-pool.title': {
    en: 'Random pool has no questions in this backup',
    es: 'El bombo aleatorio no tiene preguntas en esta copia',
    fr: 'Le tirage aléatoire n\u2019a aucune question dans cette sauvegarde',
  },
  'doctor.rule.questions.empty-pool.body': {
    en: 'The category a random slot draws from contains no other questions here. Nothing is generated to fill it.',
    es: 'La categoría de la que sale un espacio aleatorio no tiene otras preguntas aquí. No se genera nada para llenarla.',
    fr: 'La catégorie d\u2019où tire un emplacement aléatoire ne contient pas d\u2019autre question ici. Rien n\u2019est généré pour la remplir.',
  },
  'doctor.rule.questions.outside-bank.title': {
    en: 'Quiz slot points outside this backup',
    es: 'Un espacio del cuestionario apunta fuera de esta copia',
    fr: 'Un emplacement du test pointe hors de cette sauvegarde',
  },
  'doctor.rule.questions.outside-bank.body': {
    en: 'A slot reference does not match a question or bank entry in this archive. It may depend on a bank that was not packed. It is not rewritten.',
    es: 'Una referencia no coincide con una pregunta o entrada del banco en este archivo. Puede depender de un banco que no se empaquetó. No se reescribe.',
    fr: 'Une référence ne correspond à aucune question ni entrée de banque dans cette archive. Elle peut dépendre d\u2019une banque non incluse. Elle n\u2019est pas réécrite.',
  },
  'doctor.rule.questions.bad-filter.title': {
    en: 'Question set filter is not JSON',
    es: 'El filtro del conjunto de preguntas no es JSON',
    fr: 'Le filtre de l\u2019ensemble de questions n\u2019est pas du JSON',
  },
  'doctor.rule.questions.bad-filter.body': {
    en: 'filtercondition is not valid JSON, so category and tag filters cannot be checked. It is not rewritten.',
    es: 'filtercondition no es JSON válido, así que no se pueden comprobar categoría ni etiquetas. No se reescribe.',
    fr: 'filtercondition n\u2019est pas du JSON valide, donc les filtres de catégorie et d\u2019étiquette ne peuvent pas être vérifiés. Il n\u2019est pas réécrit.',
  },
  'doctor.rule.questions.missing-bank-file.title': {
    en: 'questions.xml is missing',
    es: 'Falta questions.xml',
    fr: 'questions.xml est absent',
  },
  'doctor.rule.questions.missing-bank-file.body': {
    en: 'restore_dbops::load_categories_and_questions_to_tempids throws missing_questions_xml_file when questions.xml is absent. Moodle writes an empty question_categories document even when the bank is empty. An empty file is offered only when no scanned XML depends on the question bank. It has not been restored in Moodle.',
    es: 'restore_dbops::load_categories_and_questions_to_tempids lanza missing_questions_xml_file cuando falta questions.xml. Moodle escribe un question_categories vacío aunque el banco no tenga preguntas. Un archivo vacío solo se ofrece cuando ningún XML analizado depende del banco. No se ha restaurado en Moodle.',
    fr: 'restore_dbops::load_categories_and_questions_to_tempids lève missing_questions_xml_file lorsque questions.xml est absent. Moodle écrit un question_categories vide même si la banque est vide. Un fichier vide n\u2019est proposé que si aucun XML analysé ne dépend de la banque. Il n\u2019a pas été restauré dans Moodle.',
  },
  'doctor.rule.questions.multiple-top-categories.title': {
    en: 'More than one top-level question category',
    es: 'Más de una categoría de preguntas de nivel superior',
    fr: 'Plusieurs catégories de questions de premier niveau',
  },
  'doctor.rule.questions.multiple-top-categories.body': {
    en: "Moodle's question-bank precheck counts categories whose parent is 0 in one context. restore_dbops::prechek_precheck_qbanks_by_level reports restoremultipletopcats when backup_release is at least 3.5 and the first eight digits of moodle_version are after 20180205. backup_version is not the field that compare reads. Categories are not merged or deleted.",
    es: 'La comprobación del banco cuenta las categorías cuyo padre es 0 en un contexto. restore_dbops::prechek_precheck_qbanks_by_level informa restoremultipletopcats cuando backup_release es 3.5 o posterior y los ocho primeros dígitos de moodle_version son posteriores a 20180205. backup_version no es el campo que se compara. Las categorías no se fusionan ni se borran.',
    fr: 'Le contrôle de la banque compte les catégories dont le parent est 0 dans un contexte. restore_dbops::prechek_precheck_qbanks_by_level signale restoremultipletopcats lorsque backup_release vaut au moins 3.5 et que les huit premiers chiffres de moodle_version sont postérieurs à 20180205. backup_version n\u2019est pas le champ comparé. Les catégories ne sont ni fusionnées ni supprimées.',
  },
  'doctor.rule.questions.attempt-missing-question.title': {
    en: 'Legacy quiz attempt points at a missing question',
    es: 'Un intento antiguo del cuestionario apunta a una pregunta ausente',
    fr: 'Une tentative ancienne de test pointe vers une question absente',
  },
  'doctor.rule.questions.attempt-missing-question.body': {
    en: 'This activity still has Moodle 2.0 question states or sessions. process_legacy_quiz_attempt_data throws questionattemptreferstomissingquestion when a question id in that attempt is not in the restored question bank. Attempts are not deleted.',
    es: 'Esta actividad aún tiene estados o sesiones de pregunta de Moodle 2.0. process_legacy_quiz_attempt_data lanza questionattemptreferstomissingquestion cuando un id de pregunta de ese intento no está en el banco restaurado. Los intentos no se borran.',
    fr: 'Cette activité contient encore des états ou des sessions de question Moodle 2.0. process_legacy_quiz_attempt_data lève questionattemptreferstomissingquestion lorsqu\u2019un identifiant de question de cette tentative n\u2019est pas dans la banque restaurée. Les tentatives ne sont pas supprimées.',
  },
  'doctor.rule.questions.attempt-data-missing.title': {
    en: 'Legacy quiz attempt is missing session or state data',
    es: 'A un intento antiguo le falta la sesión o los estados',
    fr: 'Une tentative ancienne n\u2019a pas de session ou d\u2019états',
  },
  'doctor.rule.questions.attempt-data-missing.body': {
    en: 'process_legacy_quiz_attempt_data throws questionattemptdatamissing when a referenced question has no session or no states. The records that are present are not deleted.',
    es: 'process_legacy_quiz_attempt_data lanza questionattemptdatamissing cuando una pregunta referenciada no tiene sesión o no tiene estados. Los registros presentes no se borran.',
    fr: 'process_legacy_quiz_attempt_data lève questionattemptdatamissing lorsqu\u2019une question référencée n\u2019a pas de session ou n\u2019a pas d\u2019états. Les enregistrements présents ne sont pas supprimés.',
  },
  'doctor.rule.questions.duplicate-id.title': {
    en: 'Duplicate question id',
    es: 'Identificador de pregunta duplicado',
    fr: 'Identifiant de question en double',
  },
  'doctor.rule.questions.duplicate-id.body': {
    en: 'Two question elements share one id. Neither is renumbered.',
    es: 'Dos elementos question comparten un id. No se renumeran.',
    fr: 'Deux éléments question partagent un id. Aucun n\u2019est renuméroté.',
  },
  'doctor.rule.plugins.removed.title': {
    en: 'Activity module was removed from Moodle core',
    es: 'El módulo de actividad se eliminó del núcleo de Moodle',
    fr: 'Le module d\u2019activité a été retiré du cœur de Moodle',
  },
  'doctor.rule.plugins.removed.body': {
    en: 'This module is no longer part of Moodle core. Its XML is preserved. It is not converted into another activity.',
    es: 'Este módulo ya no forma parte del núcleo de Moodle. Su XML se conserva. No se convierte en otra actividad.',
    fr: 'Ce module ne fait plus partie du cœur de Moodle. Son XML est conservé. Il n\u2019est pas converti en une autre activité.',
  },
  'doctor.rule.plugins.unknown-module.title': {
    en: 'Activity module is not in Moodle core',
    es: 'El módulo de actividad no está en el núcleo de Moodle',
    fr: 'Le module d\u2019activité n\u2019est pas dans le cœur de Moodle',
  },
  'doctor.rule.plugins.unknown-module.body': {
    en: 'The backup names a module MBZoo does not know as core. That does not mean the destination site is missing it. Plugin data is left untouched.',
    es: 'La copia nombra un módulo que MBZoo no conoce como núcleo. Eso no significa que falte en el sitio de destino. Los datos del complemento no se tocan.',
    fr: 'La sauvegarde nomme un module que MBZoo ne connaît pas comme module du cœur. Cela ne prouve pas qu\u2019il manque sur le site cible. Les données du plugin restent intactes.',
  },
  'doctor.rule.plugins.unknown-qtype.title': {
    en: 'Question type is not in the known core set',
    es: 'El tipo de pregunta no está en el conjunto conocido del núcleo',
    fr: 'Le type de question n\u2019est pas dans l\u2019ensemble connu du cœur',
  },
  'doctor.rule.plugins.unknown-qtype.body': {
    en: 'A question uses a type MBZoo does not list as current core. It may be installed on the destination. It is not deleted or renamed.',
    es: 'Una pregunta usa un tipo que MBZoo no lista como núcleo actual. Puede estar instalado en el destino. No se borra ni se renombra.',
    fr: 'Une question utilise un type que MBZoo ne liste pas comme type actuel du cœur. Il peut être installé sur la cible. Il n\u2019est ni supprimé ni renommé.',
  },
  'doctor.rule.userdata.excluded.title': {
    en: 'User data was not included',
    es: 'No se incluyeron datos de usuario',
    fr: 'Les données utilisateur n\u2019ont pas été incluses',
  },
  'doctor.rule.userdata.excluded.body': {
    en: 'The root users setting is off. Missing submissions and users.xml are expected.',
    es: 'El ajuste de usuarios de la raíz está desactivado. Es esperable que falten envíos y users.xml.',
    fr: 'Le réglage racine des utilisateurs est désactivé. L\u2019absence de remises et de users.xml est attendue.',
  },
  'doctor.rule.userdata.missing.title': {
    en: 'users.xml is missing',
    es: 'Falta users.xml',
    fr: 'users.xml est absent',
  },
  'doctor.rule.userdata.missing.body': {
    en: 'The backup says it includes users, but users.xml is not there. Accounts are not invented.',
    es: 'La copia dice que incluye usuarios, pero users.xml no está. No se inventan cuentas.',
    fr: 'La sauvegarde dit inclure les utilisateurs, mais users.xml est absent. Aucun compte n\u2019est inventé.',
  },
  'doctor.rule.userdata.malformed.title': {
    en: 'users.xml is malformed',
    es: 'users.xml está mal formado',
    fr: 'users.xml est mal formé',
  },
  'doctor.rule.userdata.malformed.body': {
    en: 'The user file did not parse. Usernames, emails and ids are not modified. This report does not copy them.',
    es: 'El archivo de usuarios no se pudo leer. No se modifican nombres, correos ni ids. Este informe no los copia.',
    fr: 'Le fichier des utilisateurs n\u2019a pas pu être lu. Identifiants, adresses et ids ne sont pas modifiés. Ce rapport ne les copie pas.',
  },
  'doctor.rule.references.unknown-context.title': {
    en: 'File context id is not declared in this backup',
    es: 'El id de contexto de un archivo no está declarado en esta copia',
    fr: 'L\u2019identifiant de contexte d\u2019un fichier n\u2019est pas déclaré',
  },
  'doctor.rule.references.unknown-context.body': {
    en: 'restore_dbops::send_files_to_pool throws unknown_context_mapping when the old context id has no mapping. A file record uses a context id that no other scanned element declares. Context ids are not invented. A destination that never restores that component can also fail this way, which this file cannot show.',
    es: 'restore_dbops::send_files_to_pool lanza unknown_context_mapping cuando el id de contexto antiguo no tiene correspondencia. Un archivo usa un contexto que ningún otro elemento analizado declara. No se inventan ids de contexto. Un destino que no restaure ese componente también puede fallar así, y este archivo no puede mostrarlo.',
    fr: 'restore_dbops::send_files_to_pool lève unknown_context_mapping lorsque l\u2019ancien identifiant de contexte n\u2019a pas de correspondance. Un fichier utilise un contexte qu\u2019aucun autre élément analysé ne déclare. Aucun identifiant de contexte n\u2019est inventé. Une cible qui ne restaure pas ce composant peut aussi échouer ainsi, ce que ce fichier ne peut pas montrer.',
  },
  'doctor.rule.references.inforef-missing-target.title': {
    en: 'inforef.xml names an id this backup does not contain',
    es: 'inforef.xml nombra un id que esta copia no contiene',
    fr: 'inforef.xml nomme un identifiant absent de cette sauvegarde',
  },
  'doctor.rule.references.inforef-missing-target.body': {
    en: 'An inforef file references a file, question, or role id that is not in the scanned backup. A missing inforef.xml is not itself an error: Moodle loads it only when the file exists. No inforef is generated.',
    es: 'Un inforef referencia un id de archivo, pregunta o rol que no está en la copia analizada. La ausencia de inforef.xml no es por sí sola un error: Moodle lo carga solo si el archivo existe. No se genera ningún inforef.',
    fr: 'Un inforef référence un identifiant de fichier, de question ou de rôle absent de la sauvegarde analysée. L\u2019absence d\u2019inforef.xml n\u2019est pas une erreur en soi : Moodle ne le charge que si le fichier existe. Aucun inforef n\u2019est généré.',
  },
  'doctor.rule.references.inforef-duplicate.title': {
    en: 'inforef.xml repeats an id',
    es: 'inforef.xml repite un id',
    fr: 'inforef.xml répète un identifiant',
  },
  'doctor.rule.references.inforef-duplicate.body': {
    en: 'The same file, question, or role id appears more than once in one inforef list. The duplicates are left in place.',
    es: 'El mismo id de archivo, pregunta o rol aparece más de una vez en una lista de inforef. Los duplicados se dejan como están.',
    fr: 'Le même identifiant de fichier, de question ou de rôle apparaît plus d\u2019une fois dans une liste inforef. Les doublons sont laissés en place.',
  },
  'doctor.rule.references.token.title': {
    en: 'Backup link points at an activity that is not in this file',
    es: 'Un enlace de la copia apunta a una actividad que no está en este archivo',
    fr: 'Un lien de la sauvegarde pointe vers une activité absente de ce fichier',
  },
  'doctor.rule.references.token.body': {
    en: 'A $@…@$ token names a course-module id that this backup does not contain. The token is not fetched.',
    es: 'Un token $@…@$ nombra un id de módulo que esta copia no contiene. El token no se descarga.',
    fr: 'Un jeton $@…@$ nomme un id de module absent de cette sauvegarde. Le jeton n\u2019est pas téléchargé.',
  },
  'doctor.rule.embedded.package.title': {
    en: 'Activity package file is missing',
    es: 'Falta el paquete de la actividad',
    fr: 'Le paquet de l\u2019activité est absent',
  },
  'doctor.rule.embedded.package.body': {
    en: 'A SCORM or H5P activity has no matching file bytes in this backup. The package is not reconstructed.',
    es: 'Una actividad SCORM o H5P no tiene los bytes correspondientes en esta copia. El paquete no se reconstruye.',
    fr: 'Une activité SCORM ou H5P n\u2019a pas les octets correspondants dans cette sauvegarde. Le paquet n\u2019est pas reconstruit.',
  },
  'doctor.rule.archive.unreadable.consequence': {
    en: 'Moodle cannot restore a container MBZoo cannot safely list.',
    es: 'Moodle no puede restaurar un contenedor que MBZoo no puede listar con seguridad.',
    fr: 'Moodle ne peut pas restaurer un conteneur que MBZoo ne peut pas lister sans risque.',
  },
  'doctor.rule.archive.extension.consequence': {
    en: 'Some tools trust the extension and refuse the file before Moodle sees it.',
    es: 'Algunas herramientas confían en la extensión y rechazan el archivo antes de que Moodle lo vea.',
    fr: 'Certains outils se fient à l\u2019extension et refusent le fichier avant que Moodle le voie.',
  },
  'doctor.rule.archive.missing-root.consequence': {
    en: 'Restore stops before any course content is created.',
    es: 'La restauración se detiene antes de crear el contenido del curso.',
    fr: 'La restauration s\u2019arrête avant de créer le contenu du cours.',
  },
  'doctor.rule.archive.enclosed.consequence': {
    en: 'Moodle looks for moodle_backup.xml at the root and will reject the wrapper.',
    es: 'Moodle busca moodle_backup.xml en la raíz y rechazará el directorio envolvente.',
    fr: 'Moodle cherche moodle_backup.xml à la racine et rejettera le dossier enveloppant.',
  },
  'doctor.rule.archive.unwrap-root.consequence': {
    en: 'Moodle looks for moodle_backup.xml at the root and rejects a wrapped backup.',
    es: 'Moodle busca moodle_backup.xml en la raíz y rechaza una copia envuelta.',
    fr: 'Moodle cherche moodle_backup.xml à la racine et rejette une sauvegarde enveloppée.',
  },
  'doctor.rule.archive.multiple-roots.consequence': {
    en: 'Restore cannot tell which manifest is the course.',
    es: 'La restauración no puede saber qué manifiesto es el curso.',
    fr: 'La restauration ne peut pas savoir quel manifeste est le cours.',
  },
  'doctor.rule.archive.unsafe-path.consequence': {
    en: 'A naive unzip could write outside the restore directory.',
    es: 'Una descompresión ingenua podría escribir fuera del directorio de restauración.',
    fr: 'Une décompression naïve pourrait écrire hors du dossier de restauration.',
  },
  'doctor.rule.archive.duplicate-path.consequence': {
    en: 'Which bytes survive depends on the unzipper.',
    es: 'Qué bytes sobreviven depende del programa que descomprime.',
    fr: 'Les octets conservés dépendent du programme de décompression.',
  },
  'doctor.rule.archive.checksum.consequence': {
    en: 'A strict tar reader may skip or reject the entry.',
    es: 'Un lector tar estricto puede omitir o rechazar la entrada.',
    fr: 'Un lecteur tar strict peut ignorer ou rejeter l\u2019entrée.',
  },
  'doctor.rule.archive.crc.consequence': {
    en: 'Moodle ZipArchive can reject the entry on restore.',
    es: 'ZipArchive de Moodle puede rechazar la entrada al restaurar.',
    fr: 'ZipArchive de Moodle peut rejeter l\u2019entrée à la restauration.',
  },
  'doctor.rule.archive.ratio.consequence': {
    en: 'Opening it could use much more memory than the .mbz suggests.',
    es: 'Abrirlo podría usar mucha más memoria de la que sugiere el .mbz.',
    fr: 'L\u2019ouvrir pourrait utiliser bien plus de mémoire que le .mbz ne le laisse penser.',
  },
  'doctor.rule.xml.malformed.consequence': {
    en: 'Moodle restore stops on this file.',
    es: 'La restauración de Moodle se detiene en este archivo.',
    fr: 'La restauration Moodle s\u2019arrête sur ce fichier.',
  },
  'doctor.rule.xml.utf8.consequence': {
    en: 'The XML parser on the server will reject the file.',
    es: 'El analizador XML del servidor rechazará el archivo.',
    fr: 'L\u2019analyseur XML du serveur rejettera le fichier.',
  },
  'doctor.rule.xml.limit.consequence': {
    en: 'A problem inside this file would not show up in this scan.',
    es: 'Un problema dentro de este archivo no aparecería en este análisis.',
    fr: 'Un problème dans ce fichier n\u2019apparaîtrait pas dans cette analyse.',
  },
  'doctor.rule.xml.illegal-chars.consequence': {
    en: 'A strict XML parser aborts on the first forbidden code point.',
    es: 'Un analizador XML estricto se detiene en el primer código prohibido.',
    fr: 'Un analyseur XML strict s\u2019arrête au premier point de code interdit.',
  },
  'doctor.rule.metadata.no-target.consequence': {
    en: 'A destination older than the backup can still refuse the restore.',
    es: 'Un destino más antiguo que la copia aún puede rechazar la restauración.',
    fr: 'Une cible plus ancienne que la sauvegarde peut encore refuser la restauration.',
  },
  'doctor.rule.metadata.target-older.consequence': {
    en: 'Compatibility is not guaranteed. Later restore steps may fail on features the older site does not implement.',
    es: 'La compatibilidad no está garantizada. Los pasos posteriores pueden fallar por funciones que el sitio antiguo no implementa.',
    fr: 'La compatibilité n\u2019est pas garantie. Les étapes suivantes peuvent échouer sur des fonctions que l\u2019ancien site n\u2019implémente pas.',
  },
  'doctor.rule.metadata.missing-roles.consequence': {
    en: 'Restore throws missing_roles_xml_file before role mappings are loaded.',
    es: 'La restauración lanza missing_roles_xml_file antes de cargar las correspondencias de roles.',
    fr: 'La restauration lève missing_roles_xml_file avant de charger les correspondances de rôles.',
  },
  'doctor.rule.sections.missing.consequence': {
    en: 'That section is restored from the manifest only, or the step fails closed.',
    es: 'Esa sección se restaura solo desde el manifiesto, o el paso se cierra en fallo.',
    fr: 'Cette section est restaurée depuis le manifeste seul, ou l\u2019étape échoue.',
  },
  'doctor.rule.sections.cycle.consequence': {
    en: 'The course format can refuse the section tree or nest it unexpectedly.',
    es: 'El formato del curso puede rechazar el árbol de secciones o anidarlo de forma imprevista.',
    fr: 'Le format de cours peut refuser l\u2019arbre des sections ou l\u2019imbriquer de façon inattendue.',
  },
  'doctor.rule.activities.missing.consequence': {
    en: 'Restore looks for that directory and stops or skips the activity.',
    es: 'La restauración busca ese directorio y se detiene o se salta la actividad.',
    fr: 'La restauration cherche ce dossier et s\u2019arrête ou ignore l\u2019activité.',
  },
  'doctor.rule.activities.missing-module.consequence': {
    en: 'Visibility, completion and grouping for that activity are not restored.',
    es: 'No se restauran la visibilidad, la finalización ni el agrupamiento de esa actividad.',
    fr: 'La visibilité, l\u2019achèvement et le groupement de cette activité ne sont pas restaurés.',
  },
  'doctor.rule.activities.undeclared.consequence': {
    en: 'Restore ignores it. Removing it would discard whatever it holds.',
    es: 'La restauración la ignora. Quitarla descartaría lo que contiene.',
    fr: 'La restauration l\u2019ignore. La retirer jetterait ce qu\u2019elle contient.',
  },
  'doctor.rule.activities.duplicate.consequence': {
    en: 'Restore mappings for that id become ambiguous.',
    es: 'Las correspondencias de restauración de ese id se vuelven ambiguas.',
    fr: 'Les correspondances de restauration de cet id deviennent ambiguës.',
  },
  'doctor.rule.activities.bad-section.consequence': {
    en: 'The activity may restore into the wrong section or fail the section lookup.',
    es: 'La actividad puede restaurarse en la sección equivocada o fallar al buscar la sección.',
    fr: 'L\u2019activité peut être restaurée dans la mauvaise section ou échouer à la recherche.',
  },
  'doctor.rule.files.excluded.consequence': {
    en: 'Restore creates the file records without the bytes that were never packed.',
    es: 'La restauración crea los registros de archivo sin los bytes que nunca se empaquetaron.',
    fr: 'La restauration crée les enregistrements sans les octets qui n\u2019ont jamais été inclus.',
  },
  'doctor.rule.files.missing.consequence': {
    en: 'The activity that uses this file restores without that content.',
    es: 'La actividad que usa este archivo se restaura sin ese contenido.',
    fr: 'L\u2019activité qui utilise ce fichier est restaurée sans ce contenu.',
  },
  'doctor.rule.files.hash.consequence': {
    en: 'Moodle addresses files by that hash, so the record will not find these bytes.',
    es: 'Moodle localiza los archivos por ese hash, así que el registro no encontrará estos bytes.',
    fr: 'Moodle adresse les fichiers par ce hash, donc l\u2019enregistrement ne trouvera pas ces octets.',
  },
  'doctor.rule.files.size.consequence': {
    en: 'A size check during restore can reject the record.',
    es: 'Una comprobación de tamaño durante la restauración puede rechazar el registro.',
    fr: 'Un contrôle de taille pendant la restauration peut rejeter l\u2019enregistrement.',
  },
  'doctor.rule.files.hash-skipped.consequence': {
    en: 'A hash mismatch in this entry would not show up in this scan.',
    es: 'Un hash distinto en esta entrada no aparecería en este análisis.',
    fr: 'Un hash différent dans cette entrée n\u2019apparaîtrait pas dans cette analyse.',
  },
  'doctor.rule.files.recover-misplaced-content.consequence': {
    en: 'Moodle looks up the payload with backup_file_manager::get_backup_content_file_location and will not see these bytes at the wrong path.',
    es: 'Moodle busca el contenido con backup_file_manager::get_backup_content_file_location y no verá estos bytes en la ruta incorrecta.',
    fr: 'Moodle cherche le contenu avec backup_file_manager::get_backup_content_file_location et ne verra pas ces octets au mauvais chemin.',
  },
  'doctor.rule.files.recovery-incomplete.consequence': {
    en: 'The bytes may still be in the archive under another name. The scan does not call that missing content.',
    es: 'Los bytes pueden seguir en el archivo con otro nombre. El análisis no lo llama contenido ausente.',
    fr: 'Les octets peuvent encore être dans l\u2019archive sous un autre nom. L\u2019analyse ne parle pas de contenu manquant.',
  },
  'doctor.rule.files.unreferenced.consequence': {
    en: 'Restore will not attach it to an activity. Deleting it could drop content the manifest failed to name.',
    es: 'La restauración no lo asociará a una actividad. Borrarlo podría eliminar contenido que el manifiesto no nombró.',
    fr: 'La restauration ne l\u2019attachera pas à une activité. Le supprimer pourrait perdre un contenu que le manifeste n\u2019a pas nommé.',
  },
  'doctor.rule.questions.legacy-random.consequence': {
    en: 'On Moodle 4.0 through 5.2 this shape is the supported compatibility case, not the coding_exception.',
    es: 'En Moodle 4.0 a 5.2 esta forma es el caso de compatibilidad admitido, no la coding_exception.',
    fr: 'Sous Moodle 4.0 à 5.2 cette forme est le cas de compatibilité pris en charge, pas la coding_exception.',
  },
  'doctor.rule.questions.random-modern.consequence': {
    en: 'Moodle 5.2 raises: You cannot restore a question with qtype "random". It must be converted to a set reference instead.',
    es: 'Moodle 5.2 lanza: You cannot restore a question with qtype "random". It must be converted to a set reference instead.',
    fr: 'Moodle 5.2 lève : You cannot restore a question with qtype "random". It must be converted to a set reference instead.',
  },
  'doctor.rule.questions.random-blocked.consequence': {
    en: 'Moodle 5.2 can still throw the random-question coding_exception on this backup.',
    es: 'Moodle 5.2 aún puede lanzar la coding_exception de la pregunta aleatoria con esta copia.',
    fr: 'Moodle 5.2 peut encore lever la coding_exception de la question aléatoire sur cette sauvegarde.',
  },
  'doctor.rule.questions.category-cycle.consequence': {
    en: 'Category restore can recurse or drop a category.',
    es: 'La restauración de categorías puede recursar o descartar una categoría.',
    fr: 'La restauration des catégories peut boucler ou abandonner une catégorie.',
  },
  'doctor.rule.questions.missing-parent.consequence': {
    en: 'The category may restore under the top category, or the step may skip it.',
    es: 'La categoría puede restaurarse bajo la categoría superior, o el paso puede omitirla.',
    fr: 'La catégorie peut être restaurée sous la catégorie racine, ou l\u2019étape peut l\u2019ignorer.',
  },
  'doctor.rule.questions.empty-pool.consequence': {
    en: 'The slot restores and then has nothing to draw at attempt time.',
    es: 'El hueco se restaura y luego no tiene nada que sortear al intentar el cuestionario.',
    fr: 'L\u2019emplacement est restauré puis n\u2019a rien à tirer au moment de la tentative.',
  },
  'doctor.rule.questions.outside-bank.consequence': {
    en: 'Restore succeeds only when that bank already exists on the destination, or it reports a missing question.',
    es: 'La restauración solo tiene éxito si ese banco ya existe en el destino; si no, informa de una pregunta ausente.',
    fr: 'La restauration ne réussit que si cette banque existe déjà sur la cible, sinon elle signale une question absente.',
  },
  'doctor.rule.questions.bad-filter.consequence': {
    en: 'Moodle 4.3 and later fail while decoding the set reference.',
    es: 'Moodle 4.3 y posteriores fallan al decodificar la referencia al conjunto.',
    fr: 'Moodle 4.3 et les versions suivantes échouent en décodant la référence d\u2019ensemble.',
  },
  'doctor.rule.questions.duplicate-id.consequence': {
    en: 'Restore mappings for that id collide.',
    es: 'Las correspondencias de restauración de ese id chocan.',
    fr: 'Les correspondances de restauration de cet id se télescopent.',
  },
  'doctor.rule.questions.missing-bank-file.consequence': {
    en: 'Restore throws missing_questions_xml_file before categories and questions are mapped.',
    es: 'La restauración lanza missing_questions_xml_file antes de mapear categorías y preguntas.',
    fr: 'La restauration lève missing_questions_xml_file avant de mapper les catégories et les questions.',
  },
  'doctor.rule.questions.multiple-top-categories.consequence': {
    en: 'The precheck reports: The backup file contains more than one top-level question categories for context …',
    es: 'La comprobación previa informa: el archivo de copia contiene más de una categoría de preguntas de nivel superior para el contexto …',
    fr: 'Le précontrôle signale : le fichier de sauvegarde contient plus d\u2019une catégorie de questions de premier niveau pour le contexte …',
  },
  'doctor.rule.questions.attempt-missing-question.consequence': {
    en: 'Restore stops while upgrading that legacy attempt. Student attempt history is left untouched.',
    es: 'La restauración se detiene al actualizar ese intento antiguo. El historial de intentos no se toca.',
    fr: 'La restauration s\u2019arrête en mettant à niveau cette tentative ancienne. L\u2019historique des tentatives n\u2019est pas modifié.',
  },
  'doctor.rule.questions.attempt-data-missing.consequence': {
    en: 'Restore stops while upgrading that legacy attempt.',
    es: 'La restauración se detiene al actualizar ese intento antiguo.',
    fr: 'La restauration s\u2019arrête en mettant à niveau cette tentative ancienne.',
  },
  'doctor.rule.plugins.removed.consequence': {
    en: 'A destination that has dropped the module cannot restore the activity.',
    es: 'Un destino que ya no tiene el módulo no puede restaurar la actividad.',
    fr: 'Une cible qui n\u2019a plus le module ne peut pas restaurer l\u2019activité.',
  },
  'doctor.rule.plugins.unknown-module.consequence': {
    en: 'Restore needs that plugin on the server. Deleting the activity would drop the teacher’s content.',
    es: 'La restauración necesita ese plugin en el servidor. Borrar la actividad eliminaría el contenido del docente.',
    fr: 'La restauration exige ce plugin sur le serveur. Supprimer l\u2019activité jetterait le contenu de l\u2019enseignant.',
  },
  'doctor.rule.plugins.unknown-qtype.consequence': {
    en: 'Without that qtype plugin, Moodle restores the question as missingtype or stops.',
    es: 'Sin ese plugin de tipo de pregunta, Moodle restaura la pregunta como missingtype o se detiene.',
    fr: 'Sans ce plugin de type de question, Moodle restaure la question en missingtype ou s\u2019arrête.',
  },
  'doctor.rule.userdata.excluded.consequence': {
    en: 'Restore creates the course without participant history.',
    es: 'La restauración crea el curso sin el historial de los participantes.',
    fr: 'La restauration crée le cours sans l\u2019historique des participants.',
  },
  'doctor.rule.userdata.missing.consequence': {
    en: 'Attempts and submissions that point at users cannot be remapped.',
    es: 'Los intentos y las entregas que apuntan a usuarios no se pueden reasignar.',
    fr: 'Les tentatives et les remises qui pointent vers des utilisateurs ne peuvent pas être réassociées.',
  },
  'doctor.rule.userdata.malformed.consequence': {
    en: 'User restore stops. Conflicts with existing accounts on the destination still cannot be seen from the file alone.',
    es: 'La restauración de usuarios se detiene. Los conflictos con cuentas ya existentes en el destino siguen sin poder verse solo desde el archivo.',
    fr: 'La restauration des utilisateurs s\u2019arrête. Les conflits avec des comptes déjà présents sur la cible restent invisibles depuis le fichier seul.',
  },
  'doctor.rule.references.unknown-context.consequence': {
    en: 'File restore can throw unknown_context_mapping for that context id.',
    es: 'La restauración de archivos puede lanzar unknown_context_mapping para ese id de contexto.',
    fr: 'La restauration des fichiers peut lever unknown_context_mapping pour cet identifiant de contexte.',
  },
  'doctor.rule.references.inforef-missing-target.consequence': {
    en: 'Restore may skip that reference or fail the step that expects the record.',
    es: 'La restauración puede omitir esa referencia o fallar en el paso que espera el registro.',
    fr: 'La restauration peut ignorer cette référence ou échouer à l\u2019étape qui attend l\u2019enregistrement.',
  },
  'doctor.rule.references.inforef-duplicate.consequence': {
    en: 'Restore may map that id twice or ignore the repeat. The file is not rewritten.',
    es: 'La restauración puede mapear ese id dos veces o ignorar la repetición. El archivo no se reescribe.',
    fr: 'La restauration peut mapper cet identifiant deux fois ou ignorer le doublon. Le fichier n\u2019est pas réécrit.',
  },
  'doctor.rule.references.token.consequence': {
    en: 'After restore the link still depends on an activity that was not in the backup.',
    es: 'Tras restaurar, el enlace sigue dependiendo de una actividad que no estaba en la copia.',
    fr: 'Après la restauration, le lien dépend encore d\u2019une activité absente de la sauvegarde.',
  },
  'doctor.rule.embedded.package.consequence': {
    en: 'The activity shell can restore while the package itself does not play.',
    es: 'La actividad puede restaurarse y, aun así, el paquete no reproducirse.',
    fr: 'L\u2019activité peut être restaurée alors que le paquet lui-même ne se lance pas.',
  },
  'doctor.limit.honesty': {
    en: 'Archive and structural validation is not a Moodle restore. Successful restoration in Moodle has not been verified.',
    es: 'La validación del archivo y de la estructura no es una restauración de Moodle. La restauración correcta en Moodle no se ha comprobado.',
    fr: 'La validation de l\u2019archive et de la structure n\u2019est pas une restauration Moodle. La restauration dans Moodle n\u2019a pas été vérifiée.',
  },
  'doctor.limit.version': {
    en: 'The declared Moodle release and backup version are never changed to bypass a compatibility check.',
    es: 'La versión de Moodle y la versión de la copia declaradas no se cambian para saltarse una comprobación de compatibilidad.',
    fr: 'La version Moodle déclarée et la version de sauvegarde ne sont jamais modifiées pour contourner un contrôle de compatibilité.',
  },
  'doctor.limit.keep': {
    en: 'Questions, activities, files, attempts, submissions and plugin XML are not deleted to force a file to parse.',
    es: 'No se borran preguntas, actividades, archivos, intentos, entregas ni XML de plugins para forzar que un archivo se lea.',
    fr: 'Les questions, activités, fichiers, tentatives, remises et XML de plugins ne sont pas supprimés pour forcer la lecture d\u2019un fichier.',
  },
  'doctor.limit.unseen': {
    en: 'A missing third-party plugin, a server limit, or a user already on the destination cannot be seen from the .mbz alone.',
    es: 'Un plugin de terceros ausente, un límite del servidor o un usuario que ya existe en el destino no se pueden ver solo desde el .mbz.',
    fr: 'Un plugin tiers absent, une limite du serveur ou un utilisateur déjà présent sur la cible ne se voient pas depuis le .mbz seul.',
  },
  'doctor.limit.external': {
    en: 'External URLs, LTI tools, H5P libraries and SCORM runtimes are not fetched or rebuilt.',
    es: 'No se descargan ni se reconstruyen URL externas, herramientas LTI, bibliotecas H5P ni entornos SCORM.',
    fr: 'Les URL externes, les outils LTI, les bibliothèques H5P et les environnements SCORM ne sont ni téléchargés ni reconstruits.',
  },
  'doctor.limit.size': {
    en: 'ZIP entries are stored uncompressed in a repaired ZIP. TAR.GZ rebuilds above 512 MB are refused.',
    es: 'Las entradas ZIP de una copia reparada se guardan sin comprimir. Las reconstrucciones TAR.GZ por encima de 512 MB se rechazan.',
    fr: 'Les entrées ZIP d\u2019une sauvegarde réparée sont stockées sans compression. Les reconstructions TAR.GZ au-dessus de 512 Mo sont refusées.',
  },
  'doctor.limit.hash': {
    en: 'File hashes and ZIP CRC-32 are checked only up to the hash budget. Larger payloads are reported as not hashed.',
    es: 'Los hashes de archivo y el CRC-32 de ZIP solo se comprueban hasta el límite de hash. Las cargas mayores se informan como no hasheadas.',
    fr: 'Les hash de fichiers et le CRC-32 ZIP ne sont vérifiés que jusqu\u2019au budget de hash. Les charges plus grandes sont signalées comme non hashées.',
  },
  'doctor.limit.report': {
    en: 'Evidence in a downloaded report names archive paths. It omits file bytes, question text, passwords, usernames and email addresses.',
    es: 'La evidencia de un informe descargado nombra rutas del archivo. Omite bytes, enunciados, contraseñas, nombres de usuario y correos.',
    fr: 'Les preuves d\u2019un rapport téléchargé nomment des chemins d\u2019archive. Elles omettent les octets, le texte des questions, les mots de passe, les identifiants et les adresses.',
  },
  'doctor.limit.crc': {
    en: 'A ZIP CRC mismatch blocks a rebuild: rewriting would store the same bytes under a freshly computed CRC and hide the mismatch.',
    es: 'Un CRC de ZIP que no coincide bloquea la reconstrucción: reescribir guardaría los mismos bytes con un CRC recién calculado y ocultaría el desajuste.',
    fr: 'Un CRC ZIP différent bloque la reconstruction : réécrire stockerait les mêmes octets sous un CRC recalculé et masquerait l\u2019écart.',
  },
  'doctor.limit.empty-docs': {
    en: 'An empty roles.xml or questions.xml file is created only when no scanned reference needs it. Those documents follow the Moodle writer roots and have not been restored in Moodle. Account conflicts, external file aliases, server limits, and answer or hint text matched against a question that already exists on the destination are not repaired from the file.',
    es: 'Un roles.xml o questions.xml vacío solo se crea cuando ninguna referencia analizada lo necesita. Esos documentos siguen las raíces que escribe Moodle y no se han restaurado en Moodle. Los conflictos de cuentas, los alias de archivos externos, los límites del servidor y el texto de una respuesta o pista comparado con una pregunta que ya existe en el destino no se reparan desde el archivo.',
    fr: 'Un roles.xml ou questions.xml vide n\u2019est créé que si aucune référence analysée n\u2019en a besoin. Ces documents suivent les racines écrites par Moodle et n\u2019ont pas été restaurés dans Moodle. Les conflits de comptes, les alias de fichiers externes, les limites du serveur et le texte d\u2019une réponse ou d\u2019un indice comparé à une question déjà présente sur la cible ne sont pas réparés depuis le fichier.',
  },
  'doctor.limit.misplaced': {
    en: 'A misplaced file is copied to its content-hash path only when another entry at or below the hash budget has the same SHA-1. A larger candidate is reported as not searched, not as missing content.',
    es: 'Un archivo mal ubicado se copia a la ruta de su hash solo cuando otra entrada dentro del límite de hash tiene el mismo SHA-1. Un candidato mayor se informa como no buscado, no como contenido ausente.',
    fr: 'Un fichier mal placé est copié vers le chemin de son hash seulement lorsqu\u2019une autre entrée, dans la limite du budget de hash, a le même SHA-1. Un candidat plus grand est signalé comme non exploré, pas comme contenu manquant.',
  },
} as const

type CopyMap = typeof COPY
type CopyKey = keyof CopyMap

function pick(lang: 'en' | 'es' | 'fr'): { [K in CopyKey]: string } {
  const out = {} as { [K in CopyKey]: string }
  for (const key of Object.keys(COPY) as CopyKey[]) out[key] = COPY[key][lang]
  return out
}

export const DOCTOR_EN = pick('en')
export const DOCTOR_ES = pick('es')
export const DOCTOR_FR = pick('fr')
