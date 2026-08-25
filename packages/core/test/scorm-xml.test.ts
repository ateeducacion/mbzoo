import { describe, expect, test } from 'bun:test'
import { defaultLaunchSco, isScorm2004, parseScormXml } from '../src/moodle/scorm-xml.ts'

/**
 * Shape taken from mod/scorm/backup/moodle2/backup_scorm_stepslib.php:39-61
 * in a real Moodle checkout, not invented.
 */
const SCORM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<activity id="7" moduleid="3020" modulename="scorm" contextid="120">
  <scorm id="7">
    <name>Demo SCORM package</name>
    <scormtype>local</scormtype>
    <reference>package.zip</reference>
    <intro>&lt;p&gt;Intro.&lt;/p&gt;</intro>
    <version>SCORM_1.2</version>
    <launch>91</launch>
    <scoes>
      <sco id="90">
        <manifest></manifest>
        <organization></organization>
        <parent>/</parent>
        <identifier>ORG-1</identifier>
        <launch></launch>
        <scormtype></scormtype>
        <title>Demo organization</title>
        <sortorder>1</sortorder>
      </sco>
      <sco id="91">
        <manifest></manifest>
        <organization>ORG-1</organization>
        <parent>ORG-1</parent>
        <identifier>ITEM-1</identifier>
        <launch>content/page1.html</launch>
        <scormtype>sco</scormtype>
        <title>First page</title>
        <sortorder>2</sortorder>
        <sco_datas>
          <sco_data id="1"><name>parameters</name><value>?mode=demo</value></sco_data>
        </sco_datas>
      </sco>
      <sco id="92">
        <organization>ORG-1</organization>
        <parent>ITEM-1</parent>
        <identifier>ITEM-2</identifier>
        <launch>content/page2.html</launch>
        <scormtype>asset</scormtype>
        <title>Nested asset</title>
        <sortorder>3</sortorder>
        <sco_datas>
          <sco_data id="2"><name>isvisible</name><value>0</value></sco_data>
        </sco_datas>
      </sco>
    </scoes>
  </scorm>
</activity>`

describe('parseScormXml', () => {
  test('reads the activity fields and the flattened course structure', async () => {
    const scorm = await parseScormXml(SCORM_XML)
    expect(scorm.name).toBe('Demo SCORM package')
    expect(scorm.version).toBe('SCORM_1.2')
    expect(scorm.packageType).toBe('local')
    expect(scorm.reference).toBe('package.zip')
    expect(scorm.scoes).toHaveLength(3)
  })

  test('keeps the nesting Moodle flattened into parent identifiers', async () => {
    const { scoes } = await parseScormXml(SCORM_XML)
    expect(scoes.map((s) => [s.identifier, s.parent])).toEqual([
      ['ORG-1', '/'],
      ['ITEM-1', 'ORG-1'],
      ['ITEM-2', 'ITEM-1'],
    ])
    expect(scoes[1]?.title).toBe('First page')
    expect(scoes[1]?.launch).toBe('content/page1.html')
    expect(scoes[1]?.scormType).toBe('sco')
  })

  test('reads sco_data name/value pairs, which is where isvisible lives', async () => {
    const { scoes } = await parseScormXml(SCORM_XML)
    expect(scoes[1]?.parameters).toBe('?mode=demo')
    expect(scoes[1]?.visible).toBe(true)
    expect(scoes[2]?.visible).toBe(false)
  })

  test('accepts the mod_exescorm fork, which renames two elements', async () => {
    const forked = SCORM_XML.replaceAll('<scorm ', '<exescorm ')
      .replaceAll('</scorm>', '</exescorm>')
      .replaceAll('scormtype>', 'exescormtype>')
    const scorm = await parseScormXml(forked)
    expect(scorm.packageType).toBe('local')
    expect(scorm.scoes[1]?.scormType).toBe('sco')
  })

  test('survives a package with no scoes at all', async () => {
    const empty = SCORM_XML.replace(/<scoes>[\s\S]*<\/scoes>/, '<scoes></scoes>')
    const scorm = await parseScormXml(empty)
    expect(scorm.scoes).toEqual([])
    expect(defaultLaunchSco(scorm.scoes)).toBeUndefined()
  })
})

describe('defaultLaunchSco', () => {
  test('picks the first launchable row, not the first row', async () => {
    // The organization row sorts first and is never launchable: Moodle tests
    // a non-empty launch, never scormtype === 'sco'.
    const { scoes } = await parseScormXml(SCORM_XML)
    expect(defaultLaunchSco(scoes)?.identifier).toBe('ITEM-1')
  })

  test('falls back to a hidden row rather than showing nothing', async () => {
    const { scoes } = await parseScormXml(SCORM_XML)
    const hiddenOnly = scoes.filter((s) => !s.visible || s.launch === '')
    expect(defaultLaunchSco(hiddenOnly)?.identifier).toBe('ITEM-2')
  })
})

describe('isScorm2004', () => {
  test('maps Moodle version strings', () => {
    expect(isScorm2004('SCORM_1.3')).toBe(true)
    expect(isScorm2004('SCORM_1.2')).toBe(false)
    expect(isScorm2004('AICC')).toBe(false)
    expect(isScorm2004('')).toBe(false)
  })
})
