/**
 * Minimal i18n (prompt §38): dictionary swap selected by the browser
 * language — deliberately not a framework.
 */
export type Lang = 'en' | 'es'

const STRINGS = {
  en: {
    'landing.title': "See what's inside your",
    'landing.sub':
      'Open Moodle course backups right in your browser. Nothing to install, nothing uploaded.',
    'drop.title': 'Drop your',
    'drop.file': 'file here',
    'drop.hint': 'ZIP and TAR.GZ · processed on your device',
    'drop.choose': 'Choose file',
    privacy: '100% local — your file never leaves your device. You can also open one via',
    'step1.t': 'Open',
    'step1.d': 'Drop the backup file',
    'step2.t': 'Explore',
    'step2.d': 'Sections and activities',
    'step3.t': 'Inspect',
    'step3.d': 'Content and files',
    'loading.reading': 'Reading',
    'loading.detecting': 'detecting format…',
    'loading.note': 'Parsing happens on your device — large courses may take a few seconds.',
    'error.title': 'Could not open this file',
    'error.tryAnother': 'Try another file',
    'error.urlPrefix': 'Could not fetch that URL',
    'error.urlSuffix': 'The server must allow cross-origin downloads (CORS).',
    openAnother: 'Open another',
    search: 'Search activity…',
    'detail.empty': 'Select an activity on the left to view its content.',
    sections: 'sections',
    activities: 'activities',
    files: 'files',
    parsedIn: 'parsed in',
    warnings: 'warning(s)',
    'loading.activity': 'Loading',
    advanced: 'Advanced · Moodle metadata',
    noContent: 'This item stores no additional content in the backup.',
    download: 'Download',
    showingPages: 'Showing {n} of {total} pages — use Download for the rest.',
    pdfError: 'Could not render “{name}” inline — use Download.',
    noRenderer: 'No dedicated renderer for “{mod}”.',
    'quiz.inspectOnly': 'Read-only inspection — MBZoo does not run Moodle quizzes.',
    'quiz.question': 'Question',
    'quiz.of': 'of',
    'quiz.noQuestions': 'No questions found for this quiz in the backup.',
    'quiz.correct': 'correct',
    'quiz.partial': 'partial',
    'quiz.wrong': 'incorrect',
    'quiz.answers': 'Answers',
    'quiz.random':
      'Random question — drawn from a category at attempt time; not included in the backup',
    prev: 'Previous',
    next: 'Next',
    availableFrom: 'Available from',
    dueDate: 'Due',
    cutoffDate: 'Cutoff',
    timeLimit: 'Time limit',
    submissionTypes: 'Submission types',
    reveal: 'Reveal answers',
    hide: 'Hide answers',
    entries: 'entries',
    glossaryEmpty: 'This glossary has no entries in the backup.',
    minutes: 'min',
    'footer.note':
      'MBZoo is experimental software — see the README for what is implemented vs planned.',
  },
  es: {
    'landing.title': 'Mira qué hay dentro de tu',
    'landing.sub':
      'Abre copias de seguridad de Moodle directamente en tu navegador. Sin instalar nada, sin subir nada.',
    'drop.title': 'Arrastra aquí tu archivo',
    'drop.file': '',
    'drop.hint': 'ZIP y TAR.GZ · procesado en tu dispositivo',
    'drop.choose': 'Elegir archivo',
    privacy: '100 % local: tu archivo nunca sale de tu dispositivo. También puedes abrir uno vía',
    'step1.t': 'Abrir',
    'step1.d': 'Arrastra la copia de seguridad',
    'step2.t': 'Explorar',
    'step2.d': 'Secciones y actividades',
    'step3.t': 'Inspeccionar',
    'step3.d': 'Contenido y archivos',
    'loading.reading': 'Leyendo',
    'loading.detecting': 'detectando formato…',
    'loading.note':
      'El análisis ocurre en tu dispositivo: los cursos grandes pueden tardar unos segundos.',
    'error.title': 'No se pudo abrir este archivo',
    'error.tryAnother': 'Probar con otro',
    'error.urlPrefix': 'No se pudo descargar esa URL',
    'error.urlSuffix': 'El servidor debe permitir descargas entre origenes (CORS).',
    openAnother: 'Abrir otro',
    search: 'Buscar actividad…',
    'detail.empty': 'Selecciona una actividad a la izquierda para ver su contenido.',
    sections: 'secciones',
    activities: 'actividades',
    files: 'archivos',
    parsedIn: 'analizado en',
    warnings: 'aviso(s)',
    'loading.activity': 'Cargando',
    advanced: 'Avanzado · metadatos Moodle',
    noContent: 'Este elemento no guarda contenido adicional en la copia.',
    download: 'Descargar',
    showingPages: 'Mostrando {n} de {total} páginas: usa Descargar para el resto.',
    pdfError: 'No se pudo mostrar «{name}»: usa Descargar.',
    noRenderer: 'Sin renderizador específico para «{mod}».',
    'quiz.inspectOnly': 'Solo inspección: MBZoo no ejecuta cuestionarios de Moodle.',
    'quiz.question': 'Pregunta',
    'quiz.of': 'de',
    'quiz.noQuestions': 'Este cuestionario no tiene preguntas en la copia.',
    'quiz.correct': 'correcta',
    'quiz.partial': 'parcial',
    'quiz.wrong': 'incorrecta',
    'quiz.answers': 'Respuestas',
    'quiz.random':
      'Pregunta al azar: se sortea de una categoría en el intento; no está en la copia',
    prev: 'Anterior',
    next: 'Siguiente',
    availableFrom: 'Disponible desde',
    dueDate: 'Entrega',
    cutoffDate: 'Cierre',
    timeLimit: 'Tiempo límite',
    submissionTypes: 'Tipos de entrega',
    reveal: 'Mostrar respuestas',
    hide: 'Ocultar respuestas',
    entries: 'entradas',
    glossaryEmpty: 'Este glosario no tiene entradas en la copia.',
    minutes: 'min',
    'footer.note':
      'MBZoo es software experimental: consulta el README para ver qué está implementado.',
  },
} as const

export type StringKey = keyof (typeof STRINGS)['en']

export function detectLang(): Lang {
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
}

const lang = detectLang()

/** Translate a key; {placeholders} substituted from vars. */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s: string = STRINGS[lang][key] ?? STRINGS.en[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v))
    }
  }
  return s
}
