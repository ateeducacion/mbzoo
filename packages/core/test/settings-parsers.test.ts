import { describe, expect, test } from 'bun:test'
import { humanizeAvailability } from '../src/moodle/availability.ts'
import { parseBookXml } from '../src/moodle/book-xml.ts'
import { parseGlossaryXml } from '../src/moodle/glossary-xml.ts'
import { parseModuleXml } from '../src/moodle/module-xml.ts'

const MODULE = `<?xml version="1.0"?>
<module id="10" moduleid="10" sectionid="2002" modulename="page" contextid="110">
  <visible>0</visible>
  <idnumber>RESTRICTED-1</idnumber>
  <groupmode>1</groupmode>
  <groupingid>0</groupingid>
  <completion>2</completion>
  <completionexpected>1800000000</completionexpected>
  <showdescription>1</showdescription>
  <availability>{"op":"&amp;","c":[{"type":"date","d":"&gt;=","t":1800000000},{"type":"group","id":7}]}</availability>
</module>`

const MODULE_NULL = `<?xml version="1.0"?>
<module id="1" moduleid="1" modulename="page">
  <visible>1</visible>
  <idnumber>$@NULL@$</idnumber>
  <groupmode>0</groupmode>
  <completion>0</completion>
  <availability>$@NULL@$</availability>
</module>`

describe('parseModuleXml', () => {
  test('parses settings with availability', async () => {
    const s = await parseModuleXml(MODULE)
    expect(s.visible).toBe(false)
    expect(s.idNumber).toBe('RESTRICTED-1')
    expect(s.groupMode).toBe('separate')
    expect(s.completion).toBe('automatic')
    expect(s.showDescription).toBe(true)
    expect(s.availability.kind).toBe('tree')
    if (s.availability.kind === 'tree') {
      expect(s.availability.conditions).toHaveLength(2)
      expect(s.availability.conditions[0]?.text).toContain('Available from')
    }
  })

  test('handles NULL sentinels', async () => {
    const s = await parseModuleXml(MODULE_NULL)
    expect(s.visible).toBe(true)
    expect(s.idNumber).toBe('')
    expect(s.completion).toBe('none')
    expect(s.availability.kind).toBe('none')
  })
})

describe('humanizeAvailability', () => {
  test('date, group, grouping, completion, grade conditions', () => {
    const a = humanizeAvailability(
      '{"op":"|","c":[{"type":"date","d":"<","t":1700000000},{"type":"grouping","id":3},{"type":"completion","cm":9},{"type":"grade","min":5,"max":10},{"type":"profile"}]}',
    )
    expect(a.kind).toBe('tree')
    if (a.kind === 'tree') {
      expect(a.op).toBe('|')
      expect(a.conditions.map((c) => c.text)).toEqual([
        'Available until 14 Nov 2023',
        'Member of grouping #3',
        'Requires completion of activity #9',
        'Grade condition (min 5, max 10)',
        'Profile condition',
      ])
    }
  })

  test('invalid JSON degrades to none', () => {
    expect(humanizeAvailability('not-json').kind).toBe('none')
    expect(humanizeAvailability('{}').kind).toBe('none')
  })
})

const BOOK = `<?xml version="1.0"?>
<activity id="9" moduleid="9" modulename="book" contextid="109">
  <book id="9">
    <name>Demo book</name>
    <intro>&lt;p&gt;Intro&lt;/p&gt;</intro>
    <chapters>
      <chapter id="9102"><weight>2</weight><subchapter>0</subchapter><title>Concepts</title><content>&lt;p&gt;Two&lt;/p&gt;</content></chapter>
      <chapter id="9101"><weight>1</weight><subchapter>0</subchapter><title>Introduction</title><content>&lt;p&gt;One&lt;/p&gt;</content></chapter>
      <chapter id="9103"><weight>3</weight><subchapter>1</subchapter><title>Example</title><content>&lt;p&gt;Three&lt;/p&gt;</content></chapter>
    </chapters>
  </book>
</activity>`

describe('parseBookXml', () => {
  test('parses chapters sorted by weight', async () => {
    const b = await parseBookXml(BOOK)
    expect(b.name).toBe('Demo book')
    expect(b.chapters.map((c) => c.title)).toEqual(['Introduction', 'Concepts', 'Example'])
    expect(b.chapters[1]?.subchapter).toBe(false)
    expect(b.chapters[2]?.subchapter).toBe(true)
    expect(b.chapters[0]?.content).toContain('One')
  })
})

const GLOSSARY = `<?xml version="1.0"?>
<activity id="7" modulename="glossary">
  <glossary id="7">
    <name>G</name>
    <entries>
      <entry id="1"><concept>MBZ</concept><definition>&lt;p&gt;Moodle Backup&lt;/p&gt;</definition></entry>
      <entry id="2"><concept><text>Wrapped</text></concept><definition><text>&lt;p&gt;Def&lt;/p&gt;</text></definition></entry>
    </entries>
  </glossary>
</activity>`

describe('parseGlossaryXml', () => {
  test('parses entries in both text styles', async () => {
    const entries = await parseGlossaryXml(GLOSSARY)
    expect(entries).toHaveLength(2)
    expect(entries[0]?.concept).toBe('MBZ')
    expect(entries[0]?.definition).toContain('Moodle Backup')
    expect(entries[1]?.concept).toBe('Wrapped')
  })
})
