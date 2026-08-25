/**
 * Parser for `users.xml` — the people a backup carries.
 *
 * A course backup taken with `users=1` writes this file, and it is not a list
 * of names: a single record carries username, email, both phone numbers,
 * institution, department, postal address, city, country, the last IP address
 * the account logged in from, a free-text description and role assignments
 * (verified on a Moodle 5.2.2 backup taken with the box ticked).
 *
 * For a tool whose whole claim is that nothing leaves your device, that a file
 * contains personal data is the most important thing it can say about it —
 * before anyone emails it, uploads it or commits it. So this parser reports
 * *what kinds* of personal data are present as well as the records, and the
 * viewer leads with the disclosure rather than with the list.
 */
import { leafValue, parseXmlEvents } from './xml.ts'

export interface BackupUser {
  readonly id: number
  readonly userName: string
  readonly firstName: string
  readonly lastName: string
  readonly email: string
  /** Institutional id, often a staff or student number. */
  readonly idNumber: string
  readonly city: string
  readonly country: string
  /** Authentication plugin the account used, e.g. "manual", "ldap". */
  readonly auth: string
  /** True when Moodle had flagged the account as deleted. */
  readonly deleted: boolean
}

/**
 * A category of personal data found in the file. Deliberately coarse: the
 * point is to warn about kinds, not to enumerate every column.
 */
export type PersonalDataKind =
  | 'names'
  | 'emails'
  | 'usernames'
  | 'idNumbers'
  | 'phones'
  | 'addresses'
  | 'ipAddresses'
  | 'descriptions'

/** Fields whose presence means the file carries that kind of data. */
const KINDS: ReadonlyArray<readonly [PersonalDataKind, readonly string[]]> = [
  ['names', ['firstname', 'lastname', 'middlename', 'alternatename']],
  ['emails', ['email']],
  ['usernames', ['username']],
  ['idNumbers', ['idnumber']],
  ['phones', ['phone1', 'phone2']],
  ['addresses', ['address', 'city', 'country', 'institution', 'department']],
  ['ipAddresses', ['lastip']],
  ['descriptions', ['description']],
]

export interface BackupUsers {
  readonly users: BackupUser[]
  /**
   * Kinds of personal data actually populated in this file — an empty field
   * is not a disclosure, so a column present but blank for everyone does not
   * count.
   */
  readonly personalData: PersonalDataKind[]
}

export async function parseUsersXml(xml: string): Promise<BackupUsers> {
  const users: BackupUser[] = []
  const populated = new Set<string>()
  const path: string[] = []
  let text = ''
  let current: Map<string, string> | undefined
  let currentId = Number.NaN
  // <roles>, <preferences> and <custom_fields> nest their own leaves; only
  // the user's own direct children describe the person.
  let depthAtUser = -1

  await parseXmlEvents(xml, (ev) => {
    if (ev.type === 'open') {
      if (ev.name === 'user' && path[path.length - 1] === 'users') {
        current = new Map()
        currentId = Number(ev.attributes.id ?? Number.NaN)
        depthAtUser = path.length
      }
      path.push(ev.name)
      return
    }
    if (ev.type === 'text') {
      text += ev.data
      return
    }

    const leaf = path[path.length - 1]
    if (current) {
      if (leaf === 'user' && path.length - 1 === depthAtUser) {
        users.push(toUser(current, currentId))
        current = undefined
        depthAtUser = -1
      } else if (leaf !== undefined && path.length - 1 === depthAtUser + 1) {
        const value = leafValue(text)
        current.set(leaf, value)
        if (value !== '') populated.add(leaf)
      }
    }

    path.pop()
    text = ''
  })

  const personalData = KINDS.filter(([, fields]) => fields.some((f) => populated.has(f))).map(
    ([kind]) => kind,
  )
  return { users, personalData }
}

function toUser(f: Map<string, string>, id: number): BackupUser {
  return {
    id,
    userName: f.get('username') ?? '',
    firstName: f.get('firstname') ?? '',
    lastName: f.get('lastname') ?? '',
    email: f.get('email') ?? '',
    idNumber: f.get('idnumber') ?? '',
    city: f.get('city') ?? '',
    country: f.get('country') ?? '',
    auth: f.get('auth') ?? '',
    deleted: (f.get('deleted') ?? '0') !== '0',
  }
}
