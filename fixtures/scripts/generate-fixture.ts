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
        <activity>
          <moduleid>3012</moduleid>
          <sectionid>2001</sectionid>
          <modulename>feedback</modulename>
          <title>Demo questionnaire</title>
          <directory>activities/feedback_3012</directory>
        </activity>
        <activity>
          <moduleid>3013</moduleid>
          <sectionid>2001</sectionid>
          <modulename>lesson</modulename>
          <title>Demo lesson</title>
          <directory>activities/lesson_3013</directory>
        </activity>
        <activity>
          <moduleid>3014</moduleid>
          <sectionid>2001</sectionid>
          <modulename>choice</modulename>
          <title>Demo choice</title>
          <directory>activities/choice_3014</directory>
        </activity>
        <activity>
          <moduleid>3015</moduleid>
          <sectionid>2001</sectionid>
          <modulename>forum</modulename>
          <title>Demo forum</title>
          <directory>activities/forum_3015</directory>
        </activity>
        <activity>
          <moduleid>3016</moduleid>
          <sectionid>2002</sectionid>
          <modulename>data</modulename>
          <title>Demo database</title>
          <directory>activities/data_3016</directory>
        </activity>
        <activity>
          <moduleid>3017</moduleid>
          <sectionid>2002</sectionid>
          <modulename>workshop</modulename>
          <title>Demo workshop</title>
          <directory>activities/workshop_3017</directory>
        </activity>
        <activity>
          <moduleid>3018</moduleid>
          <sectionid>2002</sectionid>
          <modulename>imscp</modulename>
          <title>Demo content package</title>
          <directory>activities/imscp_3018</directory>
        </activity>
        <activity>
          <moduleid>3019</moduleid>
          <sectionid>2001</sectionid>
          <modulename>url</modulename>
          <title>Demo external link</title>
          <directory>activities/url_3019</directory>
        </activity>
        <activity>
          <moduleid>3020</moduleid>
          <sectionid>2002</sectionid>
          <modulename>folder</modulename>
          <title>Demo folder</title>
          <directory>activities/folder_3020</directory>
        </activity>
        <activity>
          <moduleid>3021</moduleid>
          <sectionid>2001</sectionid>
          <modulename>chat</modulename>
          <title>Demo chat</title>
          <directory>activities/chat_3021</directory>
        </activity>
        <activity>
          <moduleid>3022</moduleid>
          <sectionid>2001</sectionid>
          <modulename>wiki</modulename>
          <title>Demo wiki</title>
          <directory>activities/wiki_3022</directory>
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

/**
 * mod/imscp stores its table of contents as a PHP-serialized array. PHP
 * counts string lengths in bytes, so the payload is built rather than typed:
 * a hand-written length is silently wrong and the whole value stops parsing.
 */
interface TocNode {
  title: string
  href: string
  children: TocNode[]
}

function imscpStructure(): string {
  const str = (v: string): string => `s:${new TextEncoder().encode(v).byteLength}:"${v}";`
  const list = (values: string[]): string =>
    `a:${values.length}:{${values.map((v, i) => `i:${i};${v}`).join('')}}`
  const node = (n: TocNode): string =>
    `a:3:{${str('title')}${str(n.title)}${str('href')}${str(n.href)}` +
    `${str('subitems')}${list(n.children.map(node))}}`
  return list(
    [
      {
        title: 'Overview',
        href: 'overview.html',
        children: [{ title: 'Details', href: 'detail.html', children: [] }],
      },
      { title: 'Appendix', href: '', children: [] },
    ].map(node),
  )
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
 * Deterministic 16x16 PNG, embedded as a literal so the package stays
 * byte-stable without a build-time image dependency.
 */
const DEMO_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mN4UShFEmIY1TCqYfhqAAAKZ3MQfMz19gAAAABJRU5ErkJggg=='

function demoPngBytes(): Uint8Array {
  const binary = atob(DEMO_PNG_BASE64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/**
 * Synthetic .h5p package (ADR-0018). Self-contained content types, so
 * playback is verifiable without vendoring real third-party libraries
 * (REPO-009 explains why those stay un-vendored).
 *
 * It deliberately reproduces the shapes that a naive fixture misses and that
 * real packages exposed:
 *
 * 1. String library versions ("majorVersion": "1"), as H5P.DragText 1.8 ships.
 * 2. A nested dependency chain, so load order actually has to be resolved.
 * 3. An image under content/, addressed through H5P.getPath() and assigned
 *    with new Image() — the path that bypasses document.createElement.
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
    // Strings on purpose: real packages ship versions this way.
    preloadedDependencies: [{ machineName: 'H5P.MBZooText', majorVersion: '1', minorVersion: '8' }],
  }
  const baseLibraryJson = {
    title: 'MBZoo Base',
    description: 'Synthetic dependency, loaded before the content type that needs it.',
    machineName: 'H5P.MBZooBase',
    majorVersion: 1,
    minorVersion: 0,
    patchVersion: 0,
    runnable: 0,
    author: 'MBZoo',
    license: 'MIT',
    preloadedJs: [{ path: 'mbzoo-base.js' }],
    preloadedCss: [{ path: 'mbzoo-base.css' }],
  }
  const baseLibraryJs = `var H5P = window.H5P || {};
H5P.MBZooBase = { marker: 'base-loaded' };
`
  const baseLibraryCss = `.h5p-mbzoo-text { font-family: system-ui, sans-serif; padding: 1rem; }
.h5p-mbzoo-image { display: block; width: 64px; height: 64px; image-rendering: pixelated; }
`
  const libraryJson = {
    title: 'MBZoo Text',
    description: 'Synthetic text + image content type for the MBZoo fixture.',
    machineName: 'H5P.MBZooText',
    // Strings on purpose, matching the h5p.json dependency above.
    majorVersion: '1',
    minorVersion: '8',
    patchVersion: 0,
    runnable: 1,
    author: 'MBZoo',
    license: 'MIT',
    embedTypes: ['div', 'iframe'],
    preloadedDependencies: [{ machineName: 'H5P.MBZooBase', majorVersion: 1, minorVersion: 0 }],
    preloadedJs: [{ path: 'mbzoo-text.js' }],
    semantics: [
      { name: 'text', type: 'text', label: 'Text', default: '<p>MBZoo synthetic H5P text.</p>' },
      { name: 'image', type: 'image', label: 'Image' },
    ],
  }
  // The image is attached with new Image() and H5P.getPath() precisely because
  // that pair is what broke against real packages: getPath() injects the
  // content id, and new Image() never reaches document.createElement.
  const libraryJs = `var H5P = window.H5P || {};
H5P.MBZooText = function (params, contentId) {
  this.params = params || {};
  this.contentId = contentId;
};
H5P.MBZooText.prototype.attach = function ($container) {
  var host = $container && $container[0] ? $container[0] : $container;
  var div = document.createElement('div');
  div.className = 'h5p-mbzoo-text';
  if (H5P.MBZooBase && H5P.MBZooBase.marker) {
    div.setAttribute('data-dependency', H5P.MBZooBase.marker);
  }
  if (typeof this.params.text === 'string') {
    div.innerHTML = this.params.text;
  }
  if (this.params.image && this.params.image.path) {
    var img = new Image();
    img.className = 'h5p-mbzoo-image';
    img.alt = 'Synthetic H5P image';
    img.src = H5P.getPath(this.params.image.path, this.contentId);
    div.appendChild(img);
  }
  host.appendChild(div);
};
`
  const contentJson = {
    text: '<p><strong>Synthetic H5P</strong>: if you can read this inside MBZoo, H5P playback works.</p>',
    image: { path: 'images/demo.png', mime: 'image/png', width: 16, height: 16 },
  }
  const entries: Zippable = {
    'h5p.json': strToU8(`${JSON.stringify(h5pJson, null, 2)}\n`),
    'content/content.json': strToU8(`${JSON.stringify(contentJson, null, 2)}\n`),
    'content/images/demo.png': demoPngBytes(),
    'H5P.MBZooBase-1.0/library.json': strToU8(`${JSON.stringify(baseLibraryJson, null, 2)}\n`),
    'H5P.MBZooBase-1.0/mbzoo-base.js': strToU8(baseLibraryJs),
    'H5P.MBZooBase-1.0/mbzoo-base.css': strToU8(baseLibraryCss),
    'H5P.MBZooText-1.8/library.json': strToU8(`${JSON.stringify(libraryJson, null, 2)}\n`),
    'H5P.MBZooText-1.8/semantics.json': strToU8(
      `${JSON.stringify(libraryJson.semantics, null, 2)}\n`,
    ),
    'H5P.MBZooText-1.8/mbzoo-text.js': strToU8(libraryJs),
  }
  // Fixed mtime keeps the nested package byte-stable across regenerations.
  return zipSync(entries, { level: 6, mtime: FIXED_MTIME })
}

/**
 * A quarter-second 8-bit mono tone, built rather than embedded so the fixture
 * stays synthetic, deterministic and readable. Gives the audio preview
 * something that actually plays instead of a placeholder that looks broken.
 */
function toneWav(): Uint8Array {
  const rate = 8000
  const samples = rate / 4
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i)
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true) // PCM header size
  view.setUint16(20, 1, true) // format: PCM
  view.setUint16(22, 1, true) // channels: mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate, true) // byte rate = rate * channels * bytes/sample
  view.setUint16(32, 1, true) // block align
  view.setUint16(34, 8, true) // bits per sample
  ascii(36, 'data')
  view.setUint32(40, samples, true)
  for (let i = 0; i < samples; i++) {
    // 440 Hz, faded out so it does not end on a click.
    const fade = 1 - i / samples
    bytes[44 + i] = 128 + Math.round(60 * fade * Math.sin((2 * Math.PI * 440 * i) / rate))
  }
  return bytes
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
      filename: 'notes.txt',
      content: 'A second file so the folder renders as a list, not a single preview.\n',
      component: 'mod_folder',
      contextId: '120',
      filearea: 'content',
      mimetype: 'text/plain',
    },
    {
      filepath: '',
      filename: 'tone.wav',
      content: toneWav(),
      component: 'mod_folder',
      contextId: '120',
      filearea: 'content',
      mimetype: 'audio/wav',
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
    sectionXml(
      2001,
      1,
      'Introduction',
      '3001,3002,3004,3006,3007,3012,3013,3014,3015,3019,3021,3022',
    ),
  )
  add('sections/section_2001/inforef.xml', `${XML_HEADER}<inforef/>`)
  add(
    'sections/section_2002/section.xml',
    sectionXml(2002, 2, 'Resources', '3003,3005,3008,3009,3010,3011,3016,3017,3018,3020'),
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
    'activities/feedback_3012/feedback.xml',
    `${XML_HEADER}<activity id="12" moduleid="12" modulename="feedback" contextid="112">
  <feedback id="12">
    <name>Demo questionnaire</name>
    <intro>&lt;p&gt;Tell us how the demo went.&lt;/p&gt;</intro>
    <anonymous>1</anonymous>
    <autonumbering>1</autonumbering>
    <page_after_submit>&lt;p&gt;Thanks for answering.&lt;/p&gt;</page_after_submit>
    <items>
      <item id="6001">
        <name>label</name>
        <label></label>
        <presentation>&lt;p id="fb-label"&gt;&lt;strong&gt;About this demo&lt;/strong&gt;&lt;/p&gt;</presentation>
        <typ>label</typ>
        <hasvalue>0</hasvalue>
        <position>1</position>
        <required>0</required>
      </item>
      <item id="6002">
        <name>Did the fixture open?</name>
        <label>Q1</label>
        <presentation>r&gt;&gt;&gt;&gt;&gt;Yes|No&lt;&lt;&lt;&lt;&lt;1</presentation>
        <typ>multichoice</typ>
        <hasvalue>1</hasvalue>
        <position>2</position>
        <required>1</required>
      </item>
      <item id="6003">
        <name>pagebreak</name>
        <presentation></presentation>
        <typ>pagebreak</typ>
        <hasvalue>0</hasvalue>
        <position>3</position>
        <required>0</required>
      </item>
      <item id="6004">
        <name>Anything else?</name>
        <label></label>
        <presentation>30|5</presentation>
        <typ>textarea</typ>
        <hasvalue>1</hasvalue>
        <position>4</position>
        <required>0</required>
      </item>
    </items>
  </feedback>
</activity>
`,
  )
  // A branching lesson: a content page whose buttons jump, then a question
  // page. Written out of reading order on purpose — Moodle serializes pages
  // by prevpageid, and the chain is what decides the order.
  add(
    'activities/lesson_3013/lesson.xml',
    `${XML_HEADER}<activity id="13" moduleid="13" modulename="lesson" contextid="113">
  <lesson id="13">
    <name>Demo lesson</name>
    <intro>&lt;p&gt;A two-page branching lesson.&lt;/p&gt;</intro>
    <pages>
      <page id="502">
        <prevpageid>501</prevpageid>
        <nextpageid>0</nextpageid>
        <qtype>3</qtype>
        <title>Which container is an .mbz?</title>
        <contents>&lt;p id="lesson-q"&gt;Pick the one that is always valid.&lt;/p&gt;</contents>
        <answers>
          <answer id="6002">
            <jumpto>-9</jumpto>
            <grade>1</grade>
            <answer_text>ZIP or TAR.GZ</answer_text>
            <response>&lt;p&gt;Correct.&lt;/p&gt;</response>
          </answer>
          <answer id="6003">
            <jumpto>0</jumpto>
            <grade>0</grade>
            <answer_text>Only RAR</answer_text>
            <response>Try again.</response>
          </answer>
        </answers>
      </page>
      <page id="501">
        <prevpageid>0</prevpageid>
        <nextpageid>502</nextpageid>
        <qtype>20</qtype>
        <title>Start here</title>
        <contents>&lt;p id="lesson-start"&gt;Choose where to go.&lt;/p&gt;</contents>
        <answers>
          <answer id="6001">
            <jumpto>502</jumpto>
            <grade>0</grade>
            <answer_text>Go to the question</answer_text>
            <response></response>
          </answer>
        </answers>
      </page>
    </pages>
  </lesson>
</activity>
`,
  )
  add(
    'activities/choice_3014/choice.xml',
    `${XML_HEADER}<activity id="14" moduleid="14" modulename="choice" contextid="114">
  <choice id="14">
    <name>Demo choice</name>
    <intro>&lt;p&gt;Which format did you drop?&lt;/p&gt;</intro>
    <allowmultiple>0</allowmultiple>
    <limitanswers>1</limitanswers>
    <allowupdate>1</allowupdate>
    <options>
      <option id="801"><text>ZIP</text><maxanswers>20</maxanswers></option>
      <option id="802"><text>TAR.GZ</text><maxanswers>0</maxanswers></option>
    </options>
  </choice>
</activity>
`,
  )
  // Discussions are user data, so this forum ships empty by construction.
  add(
    'activities/forum_3015/forum.xml',
    `${XML_HEADER}<activity id="15" moduleid="15" modulename="forum" contextid="115">
  <forum id="15">
    <type>qanda</type>
    <name>Demo forum</name>
    <intro>&lt;p&gt;Ask about the fixture.&lt;/p&gt;</intro>
    <discussions>
    </discussions>
  </forum>
</activity>
`,
  )
  add(
    'activities/data_3016/data.xml',
    `${XML_HEADER}<activity id="16" moduleid="16" modulename="data" contextid="116">
  <data id="16">
    <name>Demo database</name>
    <intro>&lt;p&gt;Collect one entry per backup.&lt;/p&gt;</intro>
    <fields>
      <field id="901">
        <type>text</type>
        <name>Backup name</name>
        <description>File name of the .mbz</description>
        <required>1</required>
      </field>
      <field id="902">
        <type>number</type>
        <name>Activities</name>
        <description>How many activities it holds</description>
        <required>0</required>
      </field>
    </fields>
    <records>
    </records>
  </data>
</activity>
`,
  )
  add(
    'activities/workshop_3017/workshop.xml',
    `${XML_HEADER}<activity id="17" moduleid="17" modulename="workshop" contextid="117">
  <workshop id="17">
    <name>Demo workshop</name>
    <intro>&lt;p&gt;Peer-assess a backup report.&lt;/p&gt;</intro>
    <phase>20</phase>
    <instructauthors>&lt;p id="ws-authors"&gt;Submit a one-page report.&lt;/p&gt;</instructauthors>
    <instructreviewers>&lt;p id="ws-reviewers"&gt;Assess clarity first.&lt;/p&gt;</instructreviewers>
    <examplesubmissions>
      <examplesubmission id="951">
        <title>Worked example</title>
        <content>&lt;p id="ws-example"&gt;This is what a good report looks like.&lt;/p&gt;</content>
      </examplesubmission>
    </examplesubmissions>
  </workshop>
</activity>
`,
  )
  // imscp.structure is a PHP-serialized table of contents (mod/imscp/lib.php).
  add(
    'activities/imscp_3018/imscp.xml',
    `${XML_HEADER}<activity id="18" moduleid="18" modulename="imscp" contextid="118">
  <imscp id="18">
    <name>Demo content package</name>
    <intro>&lt;p&gt;An IMS package with two pages.&lt;/p&gt;</intro>
    <structure>${imscpStructure()}</structure>
  </imscp>
</activity>
`,
  )
  add(
    'activities/url_3019/url.xml',
    `${XML_HEADER}<activity id="19" moduleid="19" modulename="url" contextid="119">
  <url id="19">
    <name>Demo external link</name>
    <intro>&lt;p&gt;A link MBZoo never follows on your behalf.&lt;/p&gt;</intro>
    <externalurl>https://example.org/mbzoo</externalurl>
    <display>0</display>
  </url>
</activity>
`,
  )
  add(
    'activities/folder_3020/folder.xml',
    `${XML_HEADER}<activity id="20" moduleid="20" modulename="folder" contextid="120">
  <folder id="20">
    <name>Demo folder</name>
    <intro>&lt;p&gt;Two files, including audio.&lt;/p&gt;</intro>
  </folder>
</activity>
`,
  )
  // Messages are user data, so this chat ships empty by construction.
  add(
    'activities/chat_3021/chat.xml',
    `${XML_HEADER}<activity id="21" moduleid="21" modulename="chat" contextid="121">
  <chat id="21">
    <name>Demo chat</name>
    <intro>&lt;p&gt;Office hours.&lt;/p&gt;</intro>
    <chattime>1700000000</chattime>
    <messages>
    </messages>
  </chat>
</activity>
`,
  )
  add(
    'activities/wiki_3022/wiki.xml',
    `${XML_HEADER}<activity id="22" moduleid="22" modulename="wiki" contextid="122">
  <wiki id="22">
    <name>Demo wiki</name>
    <intro>&lt;p&gt;Collaborative notes.&lt;/p&gt;</intro>
    <wikimode>collaborative</wikimode>
    <firstpagetitle>Home</firstpagetitle>
    <subwikis>
    </subwikis>
  </wiki>
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
