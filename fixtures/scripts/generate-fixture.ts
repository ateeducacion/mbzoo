/**
 * Generates the committed synthetic fixtures under fixtures/files/.
 *
 * Usage: bun run fixtures/scripts/generate-fixture.ts
 *
 * Fixtures are deterministic: fixed mtimes and file order so SHA-256
 * checksums in fixtures/manifest.yaml stay stable across regenerations.
 *
 * Note: uses fflate because @zip.js/zip.js' ZipWriter is currently
 * incompatible with Bun 1.4.0 streams (research/experiments, EXP-002).
 */

import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type Zippable, zipSync } from 'fflate'

const OUT_DIR = join(import.meta.dir, '..', 'files')
const FIXED_MTIME = new Date('2023-11-14T22:13:20Z') // matches backup_date below

function sha1(content: string): string {
  return createHash('sha1').update(content).digest('hex')
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n'

interface SpecFile {
  filepath: string
  filename: string
  content: string
  component: string
  filearea: string
  mimetype: string
}

function fileRecord(f: SpecFile): string {
  return `  <file>
    <contenthash>${sha1(f.content)}</contenthash>
    <contextid>${f.contextId}</contextid>
    <component>${f.component}</component>
    <filearea>${f.filearea}</filearea>
    <itemid>0</itemid>
    <filepath>/${f.filepath}</filepath>
    <filename>${f.filename}</filename>
    <userid>2</userid>
    <filesize>${f.content.length}</filesize>
    <mimetype>${f.mimetype}</mimetype>
    <status>0</status>
    <timecreated>1700000000</timecreated>
    <timemodified>1700000000</timemodified>
    <source>$@NULL@$</source>
    <author>$@NULL@$</author>
    <license>$@NULL@$</license>
    <sortorder>0</sortorder>
    <repositorytype>$@NULL@$</repositorytype>
    <repositoryid>$@NULL@$</repositoryid>
    <reference>$@NULL@$</reference>
  </file>`
}

/** Minimal valid course: two sections, three activities (one unknown plugin). */
function moodleBackupXml(): string {
  return `${XML_HEADER}<moodle_backup>
  <information>
    <name>demo-course-zip.mbz</name>
    <moodle_version>2020090900</moodle_version>
    <moodle_release>3.8.4+ (Build: 20200909)</moodle_release>
    <backup_version>2019111800</backup_version>
    <backup_release>3.8 - 20191118</backup_release>
    <backup_date>1700000000</backup_date>
    <original_wwwroot>https://demo.example.invalid</original_wwwroot>
    <site_identifier>mbzoosynthetic</site_identifier>
    <format>moodle2</format>
    <type>course</type>
    <details>
      <detail>
        <backup_id>00000000-0000-0000-0000-000000000001</backup_id>
        <contents>
          <activities>3</activities>
          <sections>2</sections>
        </contents>
      </detail>
    </details>
    <contents>
      <course>
        <courseid>1001</courseid>
        <title>Demo Course for MBZoo</title>
        <directory>course</directory>
      </course>
      <sections>
        <section>
          <sectionid>2001</sectionid>
          <title>Introduction</title>
          <directory>sections/section_2001</directory>
        </section>
        <section>
          <sectionid>2002</sectionid>
          <title>Resources</title>
          <directory>sections/section_2002</directory>
        </section>
      </sections>
      <activities>
        <activity>
          <moduleid>3001</moduleid>
          <sectionid>2001</sectionid>
          <modulename>page</modulename>
          <title>Welcome page</title>
          <directory>activities/page_3001</directory>
        </activity>
        <activity>
          <moduleid>3002</moduleid>
          <sectionid>2001</sectionid>
          <modulename>label</modulename>
          <title>Intro label</title>
          <directory>activities/label_3002</directory>
        </activity>
        <activity>
          <moduleid>3003</moduleid>
          <sectionid>2002</sectionid>
          <modulename>supermodule</modulename>
          <title>Unknown third-party module</title>
          <directory>activities/supermodule_3003</directory>
        </activity>
        <activity>
          <moduleid>3004</moduleid>
          <sectionid>2001</sectionid>
          <modulename>page</modulename>
          <title>About this demo</title>
          <directory>activities/page_3004</directory>
        </activity>
        <activity>
          <moduleid>3005</moduleid>
          <sectionid>2002</sectionid>
          <modulename>resource</modulename>
          <title>Synthetic guide (resource)</title>
          <directory>activities/resource_3005</directory>
        </activity>
      </activities>
    </contents>
    <settings>
      <setting><level>root</level><name>users</name><value>0</value></setting>
      <setting><level>root</level><name>anonymize</name><value>0</value></setting>
    </settings>
  </information>
</moodle_backup>
`
}

function courseXml(): string {
  return `${XML_HEADER}<course id="1001" contextid="101">
  <shortname>DEMO-101</shortname>
  <fullname>Demo Course for MBZoo</fullname>
  <idnumber>MBZOO-DEMO</idnumber>
  <summary>&lt;p&gt;Synthetic demo course generated by MBZoo.&lt;/p&gt;</summary>
  <summaryformat>1</summaryformat>
  <format>topics</format>
  <startdate>1700000000</startdate>
</course>
`
}

function sectionXml(id: number, number_: number, name: string, sequence: string): string {
  return `${XML_HEADER}<section id="${id}">
  <number>${number_}</number>
  <idnumber></idnumber>
  <name>${name}</name>
  <summary>&lt;p&gt;Section ${number_} of the synthetic demo course.&lt;/p&gt;</summary>
  <sequence>${sequence}</sequence>
  <visible>1</visible>
</section>
`
}

function activityXml(modname: string, title: string): string {
  return `${XML_HEADER}<activity id="1" moduleid="1" modulename="${modname}" contextid="102">
  <${modname} id="1">
    <name>${title}</name>
    <intro>&lt;p&gt;Content of ${title}.&lt;/p&gt;</intro>
  </${modname}>
</activity>
`
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true })

  const specFiles: SpecFile[] = [
    {
      filepath: '',
      filename: 'readme.txt',
      content: 'Demo text resource inside the MBZoo synthetic fixture.\n',
      component: 'mod_page',
      contextId: '102',
      filearea: 'content',
      mimetype: 'text/plain',
    },
    {
      filepath: '',
      filename: 'guide.txt',
      content: 'MBZoo synthetic guide. If you can read this, text preview works.',
      component: 'mod_resource',
      contextId: '105',
      filearea: 'content',
      mimetype: 'text/plain',
    },
    {
      filepath: 'img/',
      filename: 'dot.svg',
      content:
        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#367"/></svg>',
      component: 'course',
      contextId: '101',
      filearea: 'overviewfiles',
      mimetype: 'image/svg+xml',
    },
  ]

  const filesXml = `${XML_HEADER}<files>
${specFiles.map(fileRecord).join('\n')}
</files>
`

  const entries: Zippable = {}
  const add = (name: string, content: string): void => {
    entries[name] = [new TextEncoder().encode(content), { mtime: FIXED_MTIME }]
  }

  add('moodle_backup.xml', moodleBackupXml())
  add('files.xml', filesXml)
  add('course/course.xml', courseXml())
  add('sections/section_2001/section.xml', sectionXml(2001, 1, 'Introduction', '3001,3002,3004'))
  add('sections/section_2001/inforef.xml', `${XML_HEADER}<inforef/>`)
  add('sections/section_2002/section.xml', sectionXml(2002, 2, 'Resources', '3003,3005'))
  add('sections/section_2002/inforef.xml', `${XML_HEADER}<inforef/>`)
  add('activities/page_3001/page.xml', activityXml('page', 'Welcome page'))
  add('activities/page_3001/module.xml', activityXml('page', 'Welcome page'))
  add('activities/label_3002/label.xml', activityXml('label', 'Intro label'))
  add('activities/label_3002/module.xml', activityXml('label', 'Intro label'))
  add(
    'activities/supermodule_3003/supermodule.xml',
    activityXml('supermodule', 'Unknown third-party module'),
  )
  const pageContent =
    '&lt;p&gt;Hello from the MBZoo synthetic page. &lt;strong&gt;Sanitized HTML&lt;/strong&gt; works.&lt;/p&gt;'
  add(
    'activities/page_3004/page.xml',
    `${XML_HEADER}<activity id="4" moduleid="4" modulename="page" contextid="104">
  <page id="4">
    <name>About this demo</name>
    <intro></intro>
    <content>${pageContent}</content>
    <contentformat>1</contentformat>
  </page>
</activity>
`,
  )
  add(
    'activities/resource_3005/resource.xml',
    `${XML_HEADER}<activity id="5" moduleid="5" modulename="resource" contextid="105">
  <resource id="5">
    <name>Synthetic guide (resource)</name>
    <intro></intro>
  </resource>
</activity>
`,
  )
  for (const f of specFiles) {
    // Moodle's in-archive content-addressed pool: files/<2 chars>/<sha1>.
    const h = sha1(f.content)
    add(`files/${h.slice(0, 2)}/${h}`, f.content)
  }

  // Level 0 keeps the artifact small, stable and human-diffable.
  const data = zipSync(entries, { level: 6 })
  const outPath = join(OUT_DIR, 'demo-course-zip.mbz')
  await writeFile(outPath, data)
  console.log(`wrote ${outPath}`)
  console.log(`sha256 ${createHash('sha256').update(data).digest('hex')}`)
  console.log(`bytes   ${data.byteLength}`)
}

main()
