import { describe, expect, test } from 'bun:test'
import { parseUsersXml } from '../src/moodle/users-xml.ts'

// Shape verified against a Moodle 5.2.2 backup taken with users=1.
const USERS = `<?xml version="1.0"?>
<users>
  <user id="3" contextid="25">
    <username>ana</username>
    <idnumber>S-42</idnumber>
    <email>ana@example.invalid</email>
    <phone1></phone1>
    <city>Las Palmas</city>
    <country>ES</country>
    <lastip>203.0.113.7</lastip>
    <description>$@NULL@$</description>
    <auth>manual</auth>
    <firstname>Ana</firstname>
    <lastname>García</lastname>
    <deleted>0</deleted>
    <roles>
      <role_assignments>
        <assignment id="1"><roleid>5</roleid><username>SHOULD-NOT-LEAK</username></assignment>
      </role_assignments>
    </roles>
  </user>
  <user id="4" contextid="26">
    <username>luis</username>
    <email>luis@example.invalid</email>
    <auth>manual</auth>
    <firstname>Luis</firstname>
    <lastname>Pérez</lastname>
    <deleted>1</deleted>
  </user>
</users>`

describe('parseUsersXml', () => {
  test('reads each person', async () => {
    const { users } = await parseUsersXml(USERS)
    expect(users).toHaveLength(2)
    expect(users[0]?.firstName).toBe('Ana')
    expect(users[0]?.email).toBe('ana@example.invalid')
    expect(users[0]?.idNumber).toBe('S-42')
    expect(users[1]?.deleted).toBe(true)
  })

  // <roles>, <preferences> and <custom_fields> nest leaves with the same
  // names; only the user's own direct children describe the person.
  test('nested blocks cannot overwrite the user record', async () => {
    const { users } = await parseUsersXml(USERS)
    expect(users[0]?.userName).toBe('ana')
  })

  test('reports which kinds of personal data are present', async () => {
    const { personalData } = await parseUsersXml(USERS)
    expect(personalData).toContain('names')
    expect(personalData).toContain('emails')
    expect(personalData).toContain('usernames')
    expect(personalData).toContain('idNumbers')
    expect(personalData).toContain('ipAddresses')
    expect(personalData).toContain('addresses')
  })

  // An empty column is not a disclosure: warning about phone numbers when
  // nobody has one would cry wolf.
  test('a column present but blank for everyone is not reported', async () => {
    const { personalData } = await parseUsersXml(USERS)
    expect(personalData).not.toContain('phones')
    // $@NULL@$ is absence, so a NULL description does not count either.
    expect(personalData).not.toContain('descriptions')
  })

  test('an empty users.xml discloses nothing', async () => {
    const empty = await parseUsersXml('<?xml version="1.0"?><users></users>')
    expect(empty.users).toEqual([])
    expect(empty.personalData).toEqual([])
  })
})
