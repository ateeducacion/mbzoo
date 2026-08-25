/**
 * Parser for mod_feedback's feedback.xml (read-only inspection, ADR-0013).
 *
 * A feedback activity is a questionnaire: an ordered list of <item>s, each
 * with a `typ` (label, multichoice, textfield, …). Everything an item needs
 * beyond its text is packed into one `presentation` string whose encoding
 * differs per type — Moodle unpacks it in mod/feedback/item/<type>/lib.php
 * (REPO-005, read 2026-08-25).
 *
 * Observed on SMR_SOR_01_09 "Encuesta sobre la asignatura" (REPO-004):
 *   <items><item id="7010"><name>…</name><label>Pregunta1</label>
 *     <presentation>r&gt;&gt;&gt;&gt;&gt;Sí|No&lt;&lt;&lt;&lt;&lt;1</presentation>
 *     <typ>multichoice</typ><required>1</required><position>3</position>
 */
import { leafValue, parseXmlEvents } from './xml.ts'

/** How a multichoice item asks its question. */
export type FeedbackChoiceStyle = 'radio' | 'checkbox' | 'dropdown'

export interface FeedbackItem {
  readonly id: number
  /** Moodle item type: label, multichoice, textfield, numeric, pagebreak… */
  readonly type: string
  /** The question text (or, for a label, '' — its body is `html`). */
  readonly text: string
  /** Short name the author gave the item, shown next to it in Moodle. */
  readonly label: string
  /** Body of a label/info item: authored HTML, still unsanitized. */
  readonly html: string
  readonly required: boolean
  readonly position: number
  /**
   * `hasvalue`: does this item collect an answer? Moodle numbers only the
   * items that do (complete_form::add_item_number, REPO-005), so labels,
   * info blocks and page breaks are skipped by the counter.
   */
  readonly hasValue: boolean
  /** Options of a multichoice item, in author order; empty otherwise. */
  readonly choices: string[]
  /** Only meaningful when `choices` is non-empty. */
  readonly choiceStyle: FeedbackChoiceStyle
}

export interface MoodleFeedback {
  readonly items: FeedbackItem[]
  /** `autonumbering`: Moodle prefixes each answerable item with "<n>. ". */
  readonly autoNumbering: boolean
  /** Message shown after submitting; authored HTML, still unsanitized. */
  readonly pageAfterSubmit: string
  readonly anonymous: boolean
}

// mod/feedback/item/multichoice/lib.php (REPO-005):
//   presentation = <subtype> '>>>>>' <values joined by '|'> '<<<<<' <horizontal>
// where subtype is r(adio), c(heckbox) or d(ropdown); the '<<<<<' tail is
// absent for dropdowns.
const TYPE_SEP = '>>>>>'
const LINE_SEP = '|'
const ADJUST_SEP = '<<<<<'

const STYLES: Record<string, FeedbackChoiceStyle> = {
  r: 'radio',
  c: 'checkbox',
  d: 'dropdown',
}

interface MutableItem {
  id: number
  type: string
  text: string
  label: string
  presentation: string
  required: boolean
  position: number
  hasValue: boolean
}

export async function parseFeedbackXml(xml: string): Promise<MoodleFeedback> {
  const items: FeedbackItem[] = []
  let pageAfterSubmit = ''
  let anonymous = false
  let autoNumbering = false
  const path: string[] = []
  let text = ''
  let current: MutableItem | undefined

  const leafOf = (): string | undefined => path[path.length - 1]
  const parentOf = (): string | undefined => path[path.length - 2]

  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      if (ev.name === 'item' && leafOf() === 'items') {
        current = {
          id: Number(ev.attributes.id ?? Number.NaN),
          type: '',
          text: '',
          label: '',
          presentation: '',
          required: false,
          position: Number.NaN,
          hasValue: false,
        }
      }
      path.push(ev.name)
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }

    const value = leafValue(text)
    const leaf = leafOf()
    const parent = parentOf()
    if (current) {
      if (leaf === 'item' && parent === 'items') {
        items.push(finalize(current))
        current = undefined
      } else if (parent === 'item') {
        switch (leaf) {
          case 'typ':
            current.type = value.toLowerCase()
            break
          case 'name':
            current.text = value
            break
          case 'label':
            current.label = value
            break
          case 'presentation':
            current.presentation = value
            break
          case 'required':
            current.required = value === '1'
            break
          case 'position':
            current.position = Number(value)
            break
          case 'hasvalue':
            current.hasValue = value === '1'
            break
          default:
            break
        }
      }
    } else if (parent === 'feedback') {
      if (leaf === 'page_after_submit') pageAfterSubmit = value
      else if (leaf === 'anonymous') anonymous = value === '1'
      else if (leaf === 'autonumbering') autoNumbering = value === '1'
    }

    path.pop()
    text = ''
  })

  // Author order, not document order: Moodle renders by <position>.
  items.sort((a, b) => positionOf(a) - positionOf(b))
  return { items, pageAfterSubmit, anonymous, autoNumbering }
}

function positionOf(item: FeedbackItem): number {
  return Number.isFinite(item.position) ? item.position : Number.MAX_SAFE_INTEGER
}

function finalize(c: MutableItem): FeedbackItem {
  const showsHtml = c.type === 'label' || c.type === 'info'
  const { choices, choiceStyle } = unpackChoices(c.type, c.presentation)
  return {
    id: c.id,
    type: c.type,
    text: showsHtml ? '' : c.text,
    label: c.label,
    html: showsHtml ? c.presentation : '',
    required: c.required,
    position: c.position,
    hasValue: c.hasValue,
    choices,
    choiceStyle,
  }
}

/**
 * Splits a multichoice item's packed `presentation`.
 *
 * Returns no choices for every other item type: their `presentation` packs
 * widths and ranges, which are layout, not content — guessing at them would
 * put numbers on screen that the author never wrote.
 */
function unpackChoices(
  type: string,
  presentation: string,
): {
  choices: string[]
  choiceStyle: FeedbackChoiceStyle
} {
  if (type !== 'multichoice' && type !== 'multichoicerated') {
    return { choices: [], choiceStyle: 'radio' }
  }
  const sep = presentation.indexOf(TYPE_SEP)
  const subtype = sep === -1 ? 'r' : presentation.slice(0, sep)
  let body = sep === -1 ? presentation : presentation.slice(sep + TYPE_SEP.length)
  const adjust = body.indexOf(ADJUST_SEP)
  if (subtype !== 'd' && adjust !== -1) body = body.slice(0, adjust)
  const choices = body
    .split(LINE_SEP)
    .map((option) =>
      // multichoicerated prefixes each option with "<weight>####".
      type === 'multichoicerated' ? option.replace(/^\s*-?\d+####/, '') : option,
    )
    .map((option) => option.trim())
    .filter((option) => option !== '')
  return { choices, choiceStyle: STYLES[subtype] ?? 'radio' }
}
