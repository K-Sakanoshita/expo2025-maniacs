const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { prepareData } = require('../examples/expo-facilities.js');
const fixture = { features: [
    { properties: { osm_id: 'node/1', name: '<img onerror="bad">', tags: { amenity: 'toilets' } }, geometry: { type: 'Point', coordinates: [135, 34] } },
    { properties: { osm_id: 'way/2', name: '', tags: { amenity: 'drinking_water' } }, geometry: { type: 'Polygon', coordinates: [[[135, 34], [135.02, 34], [135.02, 34.02], [135, 34]]] } },
    { properties: { osm_id: 'node/3', name: '', tags: { amenity: 'vending_machine' } }, geometry: { type: 'Point', coordinates: [135.01, 34.01] } },
    { properties: { tags: { 'historic:amenity': 'toilets' } }, geometry: { type: 'Point', coordinates: [136, 35] } },
    { properties: { tags: { tourism: 'theme_park', building: 'yes' } }, geometry: { type: 'Polygon', coordinates: [[[134.99, 33.99], [135.03, 33.99], [135.03, 34.03], [134.99, 33.99]]] } }
] };
const result = prepareData(fixture);
assert.deepEqual(result.counts, { toilets: 1, drinking_water: 1, vending_machine: 1 });
assert.deepEqual(result.markers.features[1].geometry.coordinates, [135.01, 34.010000000000005]);
assert.equal(result.markers.features[1].properties.original_geometry, 'Polygon');
assert.deepEqual(result.bounds, [[134.99, 33.99], [135.03, 34.03]]);
assert.equal(result.venues.features.length, 1);
assert.equal(result.buildings.features.length, 1);
const real = prepareData(JSON.parse(fs.readFileSync('data/releases/2026-10-10-2/expo2025.geojson')));
assert.deepEqual(real.counts, { toilets: 64, drinking_water: 50, vending_machine: 248 });
assert.equal(real.markers.features.length, 362);
assert.throws(() => prepareData({ features: [] }), /対象/);

async function check(fail) {
    const element = () => ({ children: [], dataset: {}, handlers: {}, style: {}, append(...nodes) { this.children.push(...nodes); }, replaceChildren(...nodes) { this.children = nodes; }, setAttribute() {}, addEventListener(name, handler) { this.handlers[name] = handler; } });
    const elements = Object.fromEntries(['status', 'legend', 'reset-view'].map(id => [id, element()]));
    const handlers = {}, sources = {}, layers = [], images = [];
    let popup, mapOptions, fitCount = 0;
    class Map {
        constructor(options) { mapOptions = options; }
        addControl() {}
        on(event, layer, callback) { handlers[`${event}:${typeof layer === 'string' ? layer : ''}`] = callback || layer; }
        addSource(id, source) { sources[id] = source; }
        addLayer(layer) { layers.push(layer); }
        addImage(id) { images.push(id); }
        fitBounds(box) { fitCount++; assert.deepEqual(JSON.parse(JSON.stringify(box)), result.bounds); }
        queryRenderedFeatures() { return [sources.facilities.data.features[0]]; }
    }
    class Popup {
        setLngLat() { return this; }
        setDOMContent(content) { popup = content; return this; }
        addTo() { return this; }
    }
    const context = { module: { exports: {} }, console,
        document: { getElementById: id => elements[id], createTextNode: text => ({ textContent: text }), createElement: tag => {
            const node = element();
            if (tag === 'canvas') node.getContext = () => ({ beginPath() {}, arc() {}, moveTo() {}, lineTo() {}, closePath() {}, rect() {}, fill() {}, stroke() {}, getImageData() { return {}; } });
            return node;
        } },
        fetch: async () => ({ ok: !fail, status: 404, json: async () => fixture }),
        maplibregl: { Map, Popup, NavigationControl: class {}, ScaleControl: class {} }
    };
    vm.runInNewContext(fs.readFileSync('examples/expo-facilities.js', 'utf8'), context);
    await context.module.exports.initialize();
    if (fail) {
        assert.equal(elements.status.dataset.error, 'true');
        assert.equal(elements.status.children[1].href, './expo-facilities.svg');
        assert.equal(mapOptions, undefined);
        return;
    }
    handlers['load:']();
    assert.equal(elements.status.dataset.error, undefined);
    assert.equal(mapOptions.cooperativeGestures, true);
    assert.deepEqual(images, ['vending_machine', 'drinking_water', 'toilets']);
    assert.deepEqual(layers.map(layer => layer.type), ['fill', 'fill', 'symbol', 'symbol', 'symbol']);
    assert.equal(sources.facilities.data.features.length, 3);
    assert.match(sources.venues.attribution, /openstreetmap.org\/copyright/);
    assert.equal(fitCount, 1);
    elements['reset-view'].handlers.click();
    assert.equal(fitCount, 2);
    handlers['click:']({ point: {} });
    assert.equal(popup.children[0].textContent, '<img onerror="bad">', 'names are plain text');
    assert.equal(popup.children[3].href, '../?node/1');
    handlers['error:']();
    assert.equal(elements.status.dataset.error, 'true');
}
(async () => {
    await check(false); await check(true);
    console.log('PASS: exact filters/counts, bbox placement, map layers, reset, safe popup and failure fallback');
})().catch(error => { console.error(error); process.exitCode = 1; });
