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
import { strToU8, type Zippable, zipSync } from 'fflate'

const OUT_DIR = join(import.meta.dir, '..', 'files')
const FIXED_MTIME = new Date('2023-11-14T22:13:20Z') // matches backup_date below

function sha1(content: string | Uint8Array): string {
  return createHash('sha1').update(content).digest('hex')
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n'

interface SpecFile {
  filepath: string
  filename: string
  content: string | Uint8Array
  component: string
  contextId: string
  filearea: string
  mimetype: string
}

function fileRecord(f: SpecFile): string {
  const size = typeof f.content === 'string' ? f.content.length : f.content.byteLength
  return `  <file>
    <contenthash>${sha1(f.content)}</contenthash>
    <contextid>${f.contextId}</contextid>
    <component>${f.component}</component>
    <filearea>${f.filearea}</filearea>
    <itemid>0</itemid>
    <filepath>/${f.filepath}</filepath>
    <filename>${f.filename}</filename>
    <userid>2</userid>
    <filesize>${size}</filesize>
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
          <activities>11</activities>
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
        <activity>
          <moduleid>3006</moduleid>
          <sectionid>2001</sectionid>
          <modulename>quiz</modulename>
          <title>Self-assessment quiz</title>
          <directory>activities/quiz_3006</directory>
        </activity>
        <activity>
          <moduleid>3007</moduleid>
          <sectionid>2001</sectionid>
          <modulename>glossary</modulename>
          <title>Demo glossary</title>
          <directory>activities/glossary_3007</directory>
        </activity>
        <activity>
          <moduleid>3008</moduleid>
          <sectionid>2002</sectionid>
          <modulename>assign</modulename>
          <title>Demo assignment</title>
          <directory>activities/assign_3008</directory>
        </activity>
        <activity>
          <moduleid>3009</moduleid>
          <sectionid>2002</sectionid>
          <modulename>book</modulename>
          <title>Demo book</title>
          <directory>activities/book_3009</directory>
        </activity>
        <activity>
          <moduleid>3010</moduleid>
          <sectionid>2002</sectionid>
          <modulename>page</modulename>
          <title>Restricted page</title>
          <directory>activities/page_3010</directory>
        </activity>
        <activity>
          <moduleid>3011</moduleid>
          <sectionid>2002</sectionid>
          <modulename>h5pactivity</modulename>
          <title>Demo H5P content</title>
          <directory>activities/h5pactivity_3011</directory>
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

/**
 * Minimal synthetic .h5p package (ADR-0017): a self-contained "text"
 * content type so playback is verifiable without vendoring real
 * third-party content-type libraries. Deterministic by construction.
 */
function h5pPackageBytes(): Uint8Array {
  const h5pJson = {
    title: 'MBZoo demo text',
    language: 'en',
    mainLibrary: 'H5P.MBZooText',
    embedTypes: ['div', 'iframe'],
    license: 'CC BY',
    licenseVersion: '4.0',
    defaultLanguage: 'en',
    preloadedDependencies: [{ machineName: 'H5P.MBZooText', majorVersion: 1, minorVersion: 0 }],
  }
  const libraryJson = {
    title: 'MBZoo Text',
    description: 'Synthetic text display content type for the MBZoo fixture.',
    machineName: 'H5P.MBZooText',
    majorVersion: 1,
    minorVersion: 0,
    patchVersion: 0,
    runnable: 1,
    author: 'MBZoo',
    license: 'MIT',
    embedTypes: ['div', 'iframe'],
    preloadedJs: [{ path: 'mbzoo-text.js' }],
    semantics: [
      { name: 'text', type: 'text', label: 'Text', default: '<p>MBZoo synthetic H5P text.</p>' },
    ],
  }
  const libraryJs = `var H5P = window.H5P || {};
H5P.MBZooText = function (params) {
  this.params = params || {};
};
H5P.MBZooText.prototype.attach = function ($container) {
  var host = $container && $container[0] ? $container[0] : $container;
  var div = document.createElement('div');
  div.className = 'h5p-mbzoo-text';
  if (typeof this.params.text === 'string') {
    div.innerHTML = this.params.text;
  }
  host.appendChild(div);
};
`
  const contentJson = {
    text: '<p><strong>Synthetic H5P</strong>: if you can read this inside MBZoo, H5P playback works.</p>',
  }
  const entries: Zippable = {
    'h5p.json': strToU8(`${JSON.stringify(h5pJson, null, 2)}\n`),
    'content/content.json': strToU8(`${JSON.stringify(contentJson, null, 2)}\n`),
    'H5P.MBZooText-1.0/library.json': strToU8(`${JSON.stringify(libraryJson, null, 2)}\n`),
    'H5P.MBZooText-1.0/semantics.json': strToU8(
      `${JSON.stringify(libraryJson.semantics, null, 2)}\n`,
    ),
    'H5P.MBZooText-1.0/mbzoo-text.js': strToU8(libraryJs),
  }
  // Fixed mtime keeps the nested package byte-stable across regenerations.
  return zipSync(entries, { level: 6, mtime: FIXED_MTIME })
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
    {
      filepath: '',
      filename: 'demo-text.h5p',
      content: h5pPackageBytes(),
      component: 'mod_h5pactivity',
      contextId: '111',
      filearea: 'package',
      mimetype: 'application/zip',
    },
  ]

  const filesXml = `${XML_HEADER}<files>
${specFiles.map(fileRecord).join('\n')}
</files>
`

  const entries: Zippable = {}
  const add = (name: string, content: string | Uint8Array): void => {
    entries[name] = [
      typeof content === 'string' ? new TextEncoder().encode(content) : content,
      { mtime: FIXED_MTIME },
    ]
  }

  add('moodle_backup.xml', moodleBackupXml())
  add('files.xml', filesXml)
  add('course/course.xml', courseXml())
  add(
    'sections/section_2001/section.xml',
    sectionXml(2001, 1, 'Introduction', '3001,3002,3004,3006,3007'),
  )
  add('sections/section_2001/inforef.xml', `${XML_HEADER}<inforef/>`)
  add(
    'sections/section_2002/section.xml',
    sectionXml(2002, 2, 'Resources', '3003,3005,3008,3009,3010,3011'),
  )
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
    'activities/quiz_3006/quiz.xml',
    `${XML_HEADER}<activity id="6" moduleid="6" modulename="quiz" contextid="106">
  <quiz id="6">
    <name>Self-assessment quiz</name>
    <intro>&lt;p&gt;Two-question demo quiz.&lt;/p&gt;</intro>
    <timeopen>1700000000</timeopen>
    <timeclose>1800000000</timeclose>
    <timelimit>1800</timelimit>
    <question_instances>
      <question_instance><slot>1</slot><questionid>4001</questionid></question_instance>
      <question_instance><slot>2</slot><questionid>4002</questionid></question_instance>
    </question_instances>
  </quiz>
</activity>
`,
  )
  add(
    'activities/glossary_3007/glossary.xml',
    `${XML_HEADER}<activity id="7" moduleid="7" modulename="glossary" contextid="107">
  <glossary id="7">
    <name>Demo glossary</name>
    <intro>&lt;p&gt;Key terms.&lt;/p&gt;</intro>
    <entries>
      <entry id="9001">
        <concept>MBZ</concept>
        <definition>&lt;p&gt;Moodle Backup: the course archive format.&lt;/p&gt;</definition>
      </entry>
      <entry id="9002">
        <concept>Contenthash</concept>
        <definition>&lt;p&gt;SHA1 of file contents used by the pool.&lt;/p&gt;</definition>
      </entry>
    </entries>
  </glossary>
</activity>
`,
  )
  add(
    'activities/assign_3008/assign.xml',
    `${XML_HEADER}<activity id="8" moduleid="8" modulename="assign" contextid="108">
  <assign id="8">
    <name>Demo assignment</name>
    <intro>&lt;p&gt;Upload a short report.&lt;/p&gt;</intro>
    <allowsubmissionsfromdate>1700000000</allowsubmissionsfromdate>
    <duedate>1701000000</duedate>
    <cutoffdate>1702000000</cutoffdate>
    <submissionplugins>
      <plugin><type>file</type><enabled>1</enabled></plugin>
      <plugin><type>onlinetext</type><enabled>0</enabled></plugin>
    </submissionplugins>
  </assign>
</activity>
`,
  )
  add(
    'activities/book_3009/book.xml',
    `${XML_HEADER}<activity id="9" moduleid="9" modulename="book" contextid="109">
  <book id="9">
    <name>Demo book</name>
    <intro>&lt;p&gt;Three chapters.&lt;/p&gt;</intro>
    <chapters>
      <chapter id="9101"><parent>0</parent><weight>1</weight><subchapter>0</subchapter><title>Introduction</title><content>&lt;p&gt;Welcome to the &lt;b&gt;demo book&lt;/b&gt;.&lt;/p&gt;</content></chapter>
      <chapter id="9102"><parent>0</parent><weight>2</weight><subchapter>0</subchapter><title>Concepts</title><content>&lt;p&gt;Chapter two body.&lt;/p&gt;</content></chapter>
      <chapter id="9103"><parent>9102</parent><weight>3</weight><subchapter>1</subchapter><title>Example</title><content>&lt;p&gt;Subchapter body.&lt;/p&gt;</content></chapter>
    </chapters>
  </book>
</activity>
`,
  )
  add(
    'activities/page_3010/page.xml',
    `${XML_HEADER}<activity id="10" moduleid="10" modulename="page" contextid="110">
  <page id="10">
    <name>Restricted page</name>
    <intro></intro>
    <content>&lt;p&gt;Only visible with the right conditions.&lt;/p&gt;</content>
  </page>
</activity>
`,
  )
  add(
    'activities/page_3010/module.xml',
    `${XML_HEADER}<module id="10" moduleid="10" sectionid="2002" modulename="page" contextid="110">
  <visible>0</visible>
  <idnumber>RESTRICTED-1</idnumber>
  <groupmode>1</groupmode>
  <completion>2</completion>
  <availability>{"op":"&amp;","c":[{"type":"date","d":"&gt;=","t":1800000000},{"type":"group","id":7}]}</availability>
</module>
`,
  )
  add(
    'activities/h5pactivity_3011/h5pactivity.xml',
    `${XML_HEADER}<activity id="11" moduleid="11" modulename="h5pactivity" contextid="111">
  <h5pactivity id="11">
    <name>Demo H5P content</name>
    <intro>&lt;p&gt;Interactive content packaged as .h5p.&lt;/p&gt;</intro>
  </h5pactivity>
</activity>
`,
  )
  add(
    'questions.xml',
    `${XML_HEADER}<question_categories>
  <question_category id="1">
    <name>Default</name>
    <questions>
      <question id="4001">
        <qtype>multichoice</qtype>
        <name>Pool layout</name>
        <questiontext>&lt;p&gt;Where does MBZoo look for a file with contenthash &lt;code&gt;ab12…&lt;/code&gt;?&lt;/p&gt;</questiontext>
        <answers>
          <answer id="1"><answertext>files/ab/ab12…</answertext><fraction>1.0000000</fraction></answer>
          <answer id="2"><answertext>files/ab/cd/ab12…</answertext><fraction>0.0000000</fraction></answer>
        </answers>
      </question>
      <question id="4002">
        <qtype>truefalse</qtype>
        <name>Container formats</name>
        <questiontext>&lt;p&gt;A .mbz can be a TAR.GZ archive.&lt;/p&gt;</questiontext>
        <answers>
          <answer id="3"><answertext>True</answertext><fraction>1.0000000</fraction></answer>
          <answer id="4"><answertext>False</answertext><fraction>0.0000000</fraction></answer>
        </answers>
      </question>
    </questions>
  </question_category>
</question_categories>
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
  // Keep the landing-page example link from drifting behind the fixture.
  const publicCopy = join(
    import.meta.dir,
    '..',
    '..',
    'apps',
    'viewer',
    'public',
    'demo-course-zip.mbz',
  )
  await writeFile(publicCopy, data)
  console.log(`wrote ${outPath}`)
  console.log(`wrote ${publicCopy}`)
  console.log(`sha256 ${createHash('sha256').update(data).digest('hex')}`)
  console.log(`bytes   ${data.byteLength}`)
}

main()
