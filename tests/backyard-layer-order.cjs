const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const config = vm.runInNewContext('(' + fs.readFileSync('data/overpass-custom.jsonc', 'utf8') + ')');
const context = vm.createContext({ Conf: { osm: config.osm } });
vm.runInContext(fs.readFileSync('lib/maplib.js', 'utf8') + '\nthis.lib = new Maplibre();', context);
for (const useConfiguredAnchor of [true, false]) {
    const layers = [
        { id: 'background', type: 'background' },
        { id: 'road', type: 'line' },
        { id: 'opaque-land', type: 'fill' },
        { id: 'buildings', type: 'fill-extrusion' },
        { id: useConfiguredAnchor ? 'expo2025_placeL-text' : 'expo2025_placeC-text',
            source: useConfiguredAnchor ? 'expo2025_placeL' : 'expo2025_placeC', type: 'symbol' },
        { id: 'expo2025_private-lines', type: 'line' },
        { id: 'expo2025_private-fills', type: 'fill' }
    ];
    context.lib.map = {
        getStyle: () => ({ layers }), getLayer: id => layers.find(l => l.id === id),
        moveLayer(id, before) {
            const [layer] = layers.splice(layers.findIndex(l => l.id === id), 1);
            layers.splice(before ? layers.findIndex(l => l.id === before) : layers.length, 0, layer);
        }
    };
    context.lib.moveAreaBehindFeatures('expo2025_private');
    const fill = layers.findIndex(l => l.id === 'expo2025_private-fills');
    assert(fill > layers.findIndex(l => l.id === 'opaque-land'));
    assert(fill > layers.findIndex(l => l.id === 'buildings'));
    assert(fill < layers.findIndex(l => l.type === 'symbol'));
}
console.log('PASS: backyard remains above opaque base layers and below area names, including fallback label anchor');
