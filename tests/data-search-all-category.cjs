const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const node = () => ({ children: [], append(...items) { this.children.push(...items); },
    replaceChildren() { this.children = []; }, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, setAttribute() {} });
const elements = { 'demo-status': node(), 'demo-results': node(), 'demo-query': node() };
elements['demo-query'].value = '';
for (const key of ['wikipedia', 'wikidata', 'wikimedia_commons']) elements[`demo-${key}`] = { ...node(), checked: false };
const feature = { properties: { osm_id: 'way/123', name: '施設', tags: {
    wikipedia: 'ja:住友館#大阪・関西万博（2025年）', wikidata: 'Q123',
    wikimedia_commons: 'File:Expo 2025 Hall.jpg'
} } };
const missing = { properties: { osm_id: 'node/456', name: '施設', tags: {} } };
const context = { location: { hash: '' }, window: { addEventListener() {} },
    document: { querySelectorAll: () => [], getElementById: id => elements[id], createElement: node },
    fetch: async url => ({ ok: true, json: async () => url.endsWith('.geojson') ? { features: [feature] } : { category: {} } }),
    PublicDataSearch: class { search() { return [feature, missing]; } displayName() { return '施設'; } countryNames() { return []; } }
};
(async () => {
    vm.runInNewContext(fs.readFileSync('data-page.js', 'utf8'), context);
    await new Promise(resolve => setImmediate(resolve));
    const cells = elements['demo-results'].children[0].children;
    assert.equal(cells.length, 4);
    const wiki = new URL(cells[1].children[0].href);
    assert.equal(wiki.hostname, 'ja.wikipedia.org');
    assert.equal(decodeURIComponent(wiki.pathname), '/wiki/住友館');
    assert.equal(decodeURIComponent(wiki.hash), '#大阪・関西万博（2025年）');
    assert.equal(cells[1].children[0].textContent, '住友館#大阪・関西万博（2025年）');
    assert.equal(cells[2].children[0].href, 'https://www.wikidata.org/wiki/Q123');
    assert.equal(decodeURIComponent(new URL(cells[3].children[0].href).pathname), '/wiki/File:Expo_2025_Hall.jpg');
    assert.equal(cells[3].children[0].textContent, feature.properties.tags.wikimedia_commons);
    for (const cell of cells.slice(1)) {
        assert.equal(cell.children[0].target, '_blank');
        assert.equal(cell.children[0].rel, 'noopener noreferrer');
    }
    for (const cell of elements['demo-results'].children[1].children.slice(1)) assert.equal(cell.textContent, '—');
    assert.equal(context.referenceUrl('wikimedia_commons', 'Category:Expo 2025'), 'https://commons.wikimedia.org/wiki/Category%3AExpo_2025');
    assert.equal(new URL(context.referenceUrl('wikipedia', 'javascript:alert(1)')).protocol, 'https:');
    assert.equal(context.referenceUrl('wikipedia', '記事名のみ'), null);
    assert.equal(context.referenceUrl('wikidata', 'invalid'), null);
    elements['demo-wikipedia'].checked = true;
    elements['demo-wikipedia'].listeners.change();
    assert.equal(elements['demo-results'].children.length, 1);
    assert.equal(elements['demo-status'].textContent, '1件');
    elements['demo-wikidata'].checked = true;
    elements['demo-wikidata'].listeners.change();
    assert.equal(elements['demo-results'].children.length, 1);
    delete feature.properties.tags.wikidata;
    elements['demo-wikidata'].listeners.change();
    assert.equal(elements['demo-results'].children.length, 0, 'all checked tags required');
    for (const key of ['wikipedia', 'wikidata', 'wikimedia_commons']) elements[`demo-${key}`].checked = false;
    elements['demo-wikipedia'].listeners.change();
    assert.equal(elements['demo-results'].children.length, 2);
    console.log('PASS: four search columns, reference links, Commons filename and missing values');
})().catch(error => { console.error(error); process.exitCode = 1; });
