const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const config = fs.readFileSync(path.join(__dirname, 'fixtures/playgrounds-overpass-custom.jsonc'), 'utf8');
assert.match(config, /"Green":\s*\{[\s\S]*?"belowFeatures":\s*true/);
const context = vm.createContext({
    Conf: { osm: { Green: { expression: { belowFeatures: true } } } }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../lib/maplib.js'), 'utf8')
    + '\nthis.Maplibre = Maplibre;', context);
const layers = [
    { id: 'background', type: 'background' },
    { id: 'land', type: 'fill' },
    { id: 'road', type: 'line' },
    { id: 'marker-bg-normal', type: 'circle' },
    { id: 'marker-fg-normal', type: 'symbol' },
    { id: 'Green-lines', type: 'line' },
    { id: 'Green-text', type: 'symbol' },
    { id: 'Green-fills', type: 'fill' },
    { id: 'Green-points', type: 'circle' }
];
const map = new context.Maplibre();
map.map = {
    getStyle: () => ({ layers }),
    getLayer: id => layers.find(layer => layer.id === id),
    moveLayer(id, beforeId) {
        const index = layers.findIndex(layer => layer.id === id);
        const [layer] = layers.splice(index, 1);
        const before = layers.findIndex(item => item.id === beforeId);
        layers.splice(before < 0 ? layers.length : before, 0, layer);
    }
};
map.moveAreaBehindFeatures('Green');
const ids = layers.map(layer => layer.id);
for (const suffix of ['lines', 'text', 'fills', 'points']) {
    assert.ok(ids.indexOf(`Green-${suffix}`) < ids.indexOf('marker-bg-normal'));
    assert.ok(ids.indexOf(`Green-${suffix}`) < ids.indexOf('road'));
}
console.log('PASS: Green area layers stay behind roads and marker icons');
