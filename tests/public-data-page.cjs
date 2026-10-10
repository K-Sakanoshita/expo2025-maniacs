const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const page = fs.readFileSync('data.html', 'utf8');
for (const match of page.matchAll(/href="\.\/([^"#]+)"/g)) {
    assert.ok(fs.existsSync(match[1].split('?')[0]), `missing local link: ${match[1]}`);
}
const config = JSON.parse(fs.readFileSync('data/config-user.jsonc', 'utf8'));
const labels = JSON.parse(fs.readFileSync('data/glot-custom.jsonc', 'utf8'));
assert.equal(config.menu.main.find(item => item['glot-model'] === 'data_publication').linkto, './data.html');
assert.equal(labels.data_publication.ja, 'データ公開');
assert.equal(labels.data_publication.en, 'Open data');

const sample = fs.readFileSync('examples/expo-map.html', 'utf8');
const script = [...sample.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
async function checkSample(fail) {
    const elements = { message: {}, status: { dataset: {} } };
    const handlers = {}, layers = [], sources = [];
    let options, popup;
    const fixture = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: '<script>test</script>', osm_id: 'node/1' }, geometry: { type: 'Point', coordinates: [135, 34] } }] };
    const style = { sources: { openmaptiles: { url: 'pmtiles://https://should-not-be-used.example/remote.pmtiles' } } };
    class Map {
        constructor(input) { options = input; }
        addControl() {}
        on(event, layer, callback) { handlers[`${event}:${typeof layer === 'string' ? layer : ''}`] = callback || layer; }
        addSource(id, source) { sources.push({ id, source }); }
        addLayer(layer) { layers.push(layer); }
    }
    class Popup {
        setLngLat() { return this; }
        setDOMContent(content) { popup = content; return this; }
        addTo() { return this; }
    }
    const context = {
        document: { getElementById: id => elements[id], createElement: () => ({ children: [], append(...nodes) { this.children.push(...nodes); } }) },
        location: { href: 'https://my-server.example/app/expo-map.html' }, URL,
        fetch: async url => ({ ok: !fail, status: fail ? 404 : 200, json: async () => url.endsWith('.geojson') ? fixture : style }),
        pmtiles: { Protocol: class { tile() {} } },
        maplibregl: { Map, Popup, NavigationControl: class {}, addProtocol() {} }
    };
    await vm.runInNewContext(script, context);
    if (fail) {
        assert.equal(elements.status.dataset.error, 'true');
        assert.match(elements.message.textContent, /HTTP 404/);
        return;
    }
    assert.equal(options.style.sources.openmaptiles.url, 'pmtiles://https://my-server.example/app/japan-20251013.pmtiles');
    handlers['load:']();
    assert.equal(sources[0].source.data, fixture);
    assert.match(sources[0].source.attribution, /openstreetmap.org\/copyright/);
    assert.deepEqual(layers.map(layer => layer.type), ['fill', 'line', 'circle']);
    handlers['click:expo-points']({ features: fixture.features, lngLat: [135, 34] });
    assert.equal(popup.children[0].textContent, '<script>test</script>', 'names must be inserted as text');
    assert.equal(popup.children[1].textContent, 'node/1');
    handlers['error:']({ error: new Error('Range not supported') });
    assert.match(elements.message.textContent, /Range/);
}
(async () => {
    await checkSample(false);
    await checkSample(true);
    const release = 'data/releases/2026-10-10';
    const geojson = JSON.parse(fs.readFileSync(path.join(release, 'expo2025.geojson'), 'utf8'));
    const example = JSON.parse(fs.readFileSync('data-example.json', 'utf8'));
    assert.deepEqual(example, geojson.features.find(feature => feature.id === example.id));
    assert.ok(geojson.features.some(feature => feature.geometry.type === 'Point'));
    assert.ok(geojson.features.some(feature => feature.geometry.type === 'LineString'));
    assert.ok(geojson.features.some(feature => feature.geometry.type === 'Polygon'));
    console.log('PASS: publication links, menu, schema example and map sample success/error behavior');
})().catch(error => { console.error(error); process.exitCode = 1; });
