const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const requests = [], warnings = [];
const output = { innerHTML: '' };
let thumbnail = null;
const context = vm.createContext({
    window: {}, URLSearchParams, Conf: { wikipedia: { domain: 'wikipedia.org' } },
    glot: { get: () => 'Wikipedia' }, document: { getElementById: () => output },
    console: { log() {}, warn: (...args) => warnings.push(args) },
    fetch: async url => {
        requests.push(new URL(url).searchParams.get('titles'));
        return { ok: true, json: async () => ({ query: { pages: { 1: { extract: 'Article introduction', thumbnail } } } }) };
    }
});
vm.runInContext(fs.readFileSync('lib/wikimedialib.js', 'utf8') + '\nthis.wikimedia = new WikimediaLib();', context);
(async () => {
    const raw = JSON.parse(fs.readFileSync('data/expo2025.json'));
    const pavilion = raw.elements.find(item => item.type === 'way' && item.id === 1382815794);
    const tag = pavilion.tags.wikipedia;
    assert.equal(tag, 'ja:住友館#大阪・関西万博（2025年）');
    for (const name of ['data/expo2025.min.json', 'data/releases/2026-10-12/expo2025.osm.json']) {
        assert.deepEqual(JSON.parse(fs.readFileSync(name)), raw);
    }
    const geo = JSON.parse(fs.readFileSync('data/releases/2026-10-12/expo2025.geojson'));
    assert.equal(geo.features.find(item => item.id === 'way/1382815794').properties.tags.wikipedia, tag);
    const mitsubishi = raw.elements.find(item => item.tags?.name === '三菱未来館');
    assert.equal(mitsubishi.tags.wikipedia, 'ja:三菱未来館#大阪・関西万博_(2025年)');
    assert.equal(geo.features.find(item => item.id === mitsubishi.type + '/' + mitsubishi.id).properties.tags.wikipedia, mitsubishi.tags.wikipedia);
    for (const [value, title, section] of [[tag, '住友館', '大阪・関西万博（2025年）'], [mitsubishi.tags.wikipedia, '三菱未来館', '大阪・関西万博_(2025年)'], ['en:Example: Title', 'Example: Title', '']]) {
        context.wikimedia.makeWikipediaOverView(value);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(requests.at(-1), title, 'API receives an article title without its section');
        const href = output.innerHTML.match(/href="([^"]+)"/)[1];
        const url = new URL(href);
        assert.equal(decodeURIComponent(url.pathname), '/wiki/' + title);
        assert.equal(decodeURIComponent(url.hash), section ? '#' + section : '');
        assert.match(output.innerHTML, /Article introduction/);
        thumbnail = { source: 'https://example.test/photo.jpg', width: 100, height: 80 };
    }
    assert.match(output.innerHTML, /<img/);
    assert.deepEqual(warnings, []);
    console.log('PASS: Sumitomo data consistency, Wikipedia section links, plain titles and optional thumbnails');
})().catch(error => { console.error(error); process.exitCode = 1; });
