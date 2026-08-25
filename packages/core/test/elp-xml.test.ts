import { describe, expect, test } from 'bun:test'
import { flattenElp, parseElpXml } from '../src/index.ts'

// The eXe object-graph shape, verified against real REPO-004 .elp files:
// Package dict -> _title/_author/_description/root(reference) ; a Node has
// _title, idevices (JsIdevice with fields), children (sub-nodes). References
// point to any object first defined with a matching `reference` id.
const XML = `<?xml version="1.0" encoding="utf-8"?>
<instance class="exe.engine.package.Package" reference="0">
  <dictionary>
    <string role="key" value="_title"></string><unicode value="Demo project"></unicode>
    <string role="key" value="_author"></string><unicode value="A. Author"></unicode>
    <string role="key" value="_description"></string><unicode value="A legacy eXe project."></unicode>
    <string role="key" value="_extraHeadContent"></string><unicode value="&lt;style&gt;.x{}&lt;/style&gt;"></unicode>
    <string role="key" value="_nodeIdDict"></string>
    <dictionary>
      <unicode role="key" value="0"></unicode>
      <instance class="exe.engine.node.Node" reference="4">
        <dictionary>
          <string role="key" value="_title"></string><unicode value="Home"></unicode>
          <string role="key" value="idevices"></string>
          <list>
            <instance class="exe.engine.jsidevice.JsIdevice" reference="7">
              <dictionary>
                <string role="key" value="fields"></string>
                <list>
                  <instance class="exe.engine.field.TextAreaField" reference="8">
                    <dictionary>
                      <string role="key" value="content_w_resourcePaths"></string>
                      <unicode value="&lt;p&gt;Body with &lt;img src=&quot;pic.png&quot;&gt;&lt;/p&gt;"></unicode>
                      <string role="key" value="content"></string>
                      <unicode value="&lt;p&gt;Body plain&lt;/p&gt;"></unicode>
                    </dictionary>
                  </instance>
                </list>
              </dictionary>
            </instance>
          </list>
          <string role="key" value="children"></string>
          <list>
            <instance class="exe.engine.node.Node" reference="9">
              <dictionary>
                <string role="key" value="_title"></string><unicode value="Chapter one"></unicode>
                <string role="key" value="idevices"></string>
                <list>
                  <instance class="exe.engine.freetextidevice.FreeTextIdevice" reference="10">
                    <dictionary>
                      <string role="key" value="content"></string>
                      <unicode value="&lt;p&gt;Nested content&lt;/p&gt;"></unicode>
                    </dictionary>
                  </instance>
                </list>
                <string role="key" value="children"></string><list></list>
              </dictionary>
            </instance>
          </list>
        </dictionary>
      </instance>
    </dictionary>
    <string role="key" value="root"></string><reference key="4"></reference>
  </dictionary>
</instance>`

describe('parseElpXml', () => {
  test('reads the package metadata', async () => {
    const elp = await parseElpXml(XML)
    expect(elp.title).toBe('Demo project')
    expect(elp.author).toBe('A. Author')
    expect(elp.description).toBe('A legacy eXe project.')
    expect(elp.extraHeadContent).toContain('<style>')
  })

  test('resolves the root reference and walks the node tree', async () => {
    const elp = await parseElpXml(XML)
    const flat = flattenElp(elp.root)
    expect(flat.map((n) => [n.node.title, n.depth])).toEqual([
      ['Home', 0],
      ['Chapter one', 1],
    ])
  })

  test('prefers the resource-path HTML and reads it from the field object', async () => {
    const elp = await parseElpXml(XML)
    // content_w_resourcePaths first (it carries the image reference), then the
    // plain content — both authored HTML the renderer will sanitize.
    expect(elp.root?.blocks[0]).toContain('<img src="pic.png">')
    expect(elp.root?.blocks[1]).toBe('<p>Body plain</p>')
  })

  test('reads a FreeTextIdevice that keeps content directly, not on a field', async () => {
    const elp = await parseElpXml(XML)
    expect(elp.root?.children[0]?.blocks).toEqual(['<p>Nested content</p>'])
  })

  test('a document that is not an eXe project yields an empty result, not a throw', async () => {
    const elp = await parseElpXml('<?xml version="1.0"?><notexe/>')
    expect(elp.root).toBeUndefined()
    expect(elp.title).toBe('')
  })

  test('a reference cycle terminates', async () => {
    const cyclic = `<instance class="exe.engine.package.Package"><dictionary>
      <string role="key" value="root"></string><reference key="1"></reference></dictionary>
      <instance class="exe.engine.node.Node" reference="1"><dictionary>
        <string role="key" value="_title"></string><unicode value="Loop"></unicode>
        <string role="key" value="children"></string><list><reference key="1"></reference></list>
      </dictionary></instance></instance>`
    const elp = await parseElpXml(cyclic)
    expect(flattenElp(elp.root).length).toBe(1)
  })
})
