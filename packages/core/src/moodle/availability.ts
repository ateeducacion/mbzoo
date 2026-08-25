/**
 * Human-readable availability conditions (REPO-006 inspiration).
 * Moodle stores restrictions as JSON: {"op":"&","c":[…]} trees with
 * date/group/grouping/completion/grade/profile condition types.
 */
export type AvailabilitySummary =
  | { kind: 'none'; conditions: [] }
  | { kind: 'tree'; conditions: AvailabilityCondition[]; op: '&' | '|' | '!' }

export interface AvailabilityCondition {
  readonly text: string
}

interface AvailabilityNode {
  op?: string
  c?: AvailabilityNode[]
  type?: string
  t?: number
  d?: string
  id?: number
  cm?: number
  min?: number
  max?: number
}

export function humanizeAvailability(raw: string): AvailabilitySummary {
  let root: AvailabilityNode
  try {
    root = JSON.parse(raw) as AvailabilityNode
  } catch {
    return { kind: 'none', conditions: [] }
  }
  const op = root.op === '|' ? '|' : root.op === '!' ? '!' : '&'
  const conditions = flatten(root)
  if (conditions.length === 0) return { kind: 'none', conditions: [] }
  return { kind: 'tree', conditions, op }
}

function flatten(node: AvailabilityNode): AvailabilityCondition[] {
  const out: AvailabilityCondition[] = []
  const walk = (n: AvailabilityNode): void => {
    if (Array.isArray(n.c)) {
      for (const child of n.c) walk(child)
      return
    }
    const text = describeLeaf(n)
    if (text) out.push({ text })
  }
  walk(node)
  return out
}

function describeLeaf(n: AvailabilityNode): string {
  switch (n.type) {
    case 'date': {
      if (!Number.isFinite(n.t)) return ''
      const when = new Date((n.t ?? 0) * 1000).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
      if (n.d === '>=') return `Available from ${when}`
      if (n.d === '<') return `Available until ${when}`
      return `Date condition (${when})`
    }
    case 'group':
      return n.id !== undefined ? `Member of group #${n.id}` : 'Group condition'
    case 'grouping':
      return n.id !== undefined ? `Member of grouping #${n.id}` : 'Grouping condition'
    case 'completion':
      return n.cm !== undefined
        ? `Requires completion of activity #${n.cm}`
        : 'Completion condition'
    case 'grade': {
      const parts: string[] = []
      if (Number.isFinite(n.min)) parts.push(`min ${n.min}`)
      if (Number.isFinite(n.max)) parts.push(`max ${n.max}`)
      return `Grade condition${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`
    }
    case 'profile':
      return 'Profile condition'
    default:
      return ''
  }
}
