/**
 * eXeLearning 2.x legacy project parser (ADR-0033).
 *
 * A `.elp` stores its project as `contentv3.xml` (also `contentv2.xml`): the
 * eXe engine's Python object graph serialized as XML. It is not a clean
 * document — it is `<instance class="…">` objects holding `<dictionary>` of
 * `<string role="key">` → value pairs, with `<reference key="N">` pointing
 * back to any object first defined as `reference="N"`. Moodle treats the
 * file as opaque; MBZoo reads the node tree and each iDevice's authored HTML
 * so a legacy project shows its content rather than a file list (ADR-0025
 * said this was possible; the corpus of real `.elp` — REPO-004 — proved the
 * shape).
 *
 * The binary `content.data` sibling (a Twisted jelly stream) is never read:
 * everything rendered comes from the XML mirror, which ~95% of real `.elp`
 * carry.
 */
import { parseXmlEvents } from './xml.ts'

/** One page of the project: a title and the HTML its iDevices authored. */
export interface ElpNode {
  readonly title: string
  /** iDevice bodies, each already-authored HTML (still to be sanitized). */
  readonly blocks: string[]
  readonly children: ElpNode[]
}

export interface MoodleElp {
  readonly title: string
  readonly author: string
  readonly description: string
  /** Author-supplied `<style>`/head markup; offered separately, never trusted. */
  readonly extraHeadContent: string
  readonly root: ElpNode | undefined
}

interface El {
  tag: string
  attrs: Record<string, string>
  children: El[]
}

/** Content fields an iDevice may carry its HTML in, richest first. */
const CONTENT_KEYS = ['content_w_resourcePaths', 'content', '_content', 'text', 'contentv2']

function buildTree(xml: string, onDone: (root: El | undefined) => void): Promise<void> {
  const rootChildren: El[] = []
  const stack: El[] = [{ tag: '#root', attrs: {}, children: rootChildren }]
  return parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      const el: El = { tag: localName(ev.name), attrs: ev.attributes, children: [] }
      stack[stack.length - 1]?.children.push(el)
      stack.push(el)
    } else if (ev.type === 'close') {
      stack.pop()
    }
  }).then(() => onDone(rootChildren[0]))
}

/** eXe serializes namespaced tags; only the local name matters here. */
function localName(name: string): string {
  const colon = name.lastIndexOf(':')
  return colon < 0 ? name : name.slice(colon + 1)
}

export async function parseElpXml(xml: string): Promise<MoodleElp> {
  let tree: El | undefined
  await buildTree(xml, (root) => {
    tree = root
  })
  const empty: MoodleElp = {
    title: '',
    author: '',
    description: '',
    extraHeadContent: '',
    root: undefined,
  }
  if (!tree) return empty

  // Index every object by its definition id so `<reference key="N">` resolves,
  // whichever direction it points.
  const byRef = new Map<string, El>()
  const index = (el: El): void => {
    const ref = el.attrs.reference
    if (ref !== undefined) byRef.set(ref, el)
    for (const c of el.children) index(c)
  }
  index(tree)

  const resolve = (el: El | undefined): El | undefined => {
    if (!el) return undefined
    if (el.tag === 'reference') return byRef.get(el.attrs.key ?? '')
    return el
  }
  const value = (el: El | undefined): string => {
    const r = resolve(el)
    return r?.attrs.value ?? ''
  }
  const dictPairs = (instance: El | undefined): Map<string, El> => {
    const out = new Map<string, El>()
    const dict = resolve(instance)?.children.find((c) => c.tag === 'dictionary')
    if (!dict) return out
    const kids = dict.children
    for (let i = 0; i < kids.length - 1; i++) {
      const k = kids[i]
      if (k && k.tag === 'string' && k.attrs.role === 'key' && k.attrs.value !== undefined) {
        const v = kids[i + 1]
        if (v) out.set(k.attrs.value, v)
        i++
      }
    }
    return out
  }
  const listItems = (el: El | undefined): El[] => {
    const r = resolve(el)
    return r && (r.tag === 'list' || r.tag === 'tuple') ? r.children : []
  }

  const pkg =
    tree.attrs.class?.includes('Package') === true
      ? tree
      : findInstance(tree, (c) => c.includes('package.Package'))
  const pd = dictPairs(pkg)

  const blocksOf = (idevice: El): string[] => {
    const out: string[] = []
    const collect = (obj: El | undefined): void => {
      const d = dictPairs(obj)
      for (const key of CONTENT_KEYS) {
        const html = value(d.get(key))
        if (html.trim() !== '') out.push(html)
      }
      // JsIdevice / GenericIdevice keep their text on child field objects.
      for (const field of listItems(d.get('fields'))) {
        const fd = dictPairs(field)
        for (const key of CONTENT_KEYS) {
          const html = value(fd.get(key))
          if (html.trim() !== '') out.push(html)
        }
      }
    }
    collect(idevice)
    return out
  }

  const seen = new Set<El>()
  const walkNode = (nodeEl: El | undefined, depth: number): ElpNode | undefined => {
    const node = resolve(nodeEl)
    if (!node || seen.has(node) || depth > 64) return undefined
    seen.add(node)
    const d = dictPairs(node)
    const blocks: string[] = []
    for (const ide of listItems(d.get('idevices'))) {
      const resolved = resolve(ide)
      if (resolved) blocks.push(...blocksOf(resolved))
    }
    const children: ElpNode[] = []
    for (const child of listItems(d.get('children'))) {
      const c = walkNode(child, depth + 1)
      if (c) children.push(c)
    }
    return { title: value(d.get('_title')), blocks, children }
  }

  return {
    title: value(pd.get('_title')),
    author: value(pd.get('_author')),
    description: value(pd.get('_description')),
    extraHeadContent: value(pd.get('_extraHeadContent')),
    root: walkNode(pd.get('root'), 0),
  }
}

function findInstance(el: El, match: (cls: string) => boolean): El | undefined {
  if (el.tag === 'instance' && el.attrs.class !== undefined && match(el.attrs.class)) return el
  for (const c of el.children) {
    const found = findInstance(c, match)
    if (found) return found
  }
  return undefined
}

/** Flattens the node tree to a depth-annotated list for rendering. */
export function flattenElp(root: ElpNode | undefined): Array<{ node: ElpNode; depth: number }> {
  const out: Array<{ node: ElpNode; depth: number }> = []
  const walk = (n: ElpNode, depth: number): void => {
    out.push({ node: n, depth })
    for (const c of n.children) walk(c, depth + 1)
  }
  if (root) walk(root, 0)
  return out
}
