const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const node = () => ({ children: [], append(...items) { this.children.push(...items); },
    replaceChildren() { this.children = []; }, addEventListener() {}, setAttribute() {} });
const elements = { 'demo-status': node(), 'demo-results': node(), 'demo-query': node() };
elements['demo-query'].value = '';
const feature = { properties: { osm_id: 'way/123', name: '施設', tags: {} } };
const context = { location: { hash: '' }, window: { addEventListener() {} },
    document: { querySelectorAll: () => [], getElementById: id => elements[id], createElement: node },
    fetch: async url => ({ ok: true, json: async () => url.endsWith('.geojson') ? { features: [feature] } : { category: {} } }),
    PublicDataSearch: class { search() { return [feature]; } displayName() { return '施設'; } countryNames() { return []; } }
};
(async () => {
    vm.runInNewContext(fs.readFileSync('data-page.js', 'utf8'), context);
    await new Promise(resolve => setImmediate(resolve));
    const link = elements['demo-results'].children[0].children[1];
    const url = new URL(link.href, 'http://localhost:8000/data.html');
    assert.equal(url.pathname, '/');
    assert.equal(url.searchParams.get('category'), '-');
    assert(url.search.startsWith('?way/123&'));
    assert.equal(link.target, '_blank');
    console.log('PASS: search results open the selected OSM object with all categories');
})().catch(error => { console.error(error); process.exitCode = 1; });
