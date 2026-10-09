const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({
    console,
    Conf: { osm: { park: { expression: { belowFeatures: false } } } },
    cMapMaker: { getPoiZoom: () => 15 }
});
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../lib/maplib.js'), 'utf8')
        + '\nthis.Maplibre = Maplibre;',
    context
);

let setDataCount = 0;
const source = { setData() { setDataCount++; } };
const map = new context.Maplibre();
map.map = { getSource: () => source };
map.geojsonSourceRevisions.set('park', 4);

assert.equal(map.isPolygonSourceCurrent('park', 4), true);
assert.equal(map.isPolygonSourceCurrent('park', 5), false);
map.addPolygon({ type: 'FeatureCollection', features: [] }, 'park', [], 4);
assert.equal(setDataCount, 0);
map.addPolygon({ type: 'FeatureCollection', features: [] }, 'park', [], 5);
assert.equal(setDataCount, 1);
assert.equal(map.geojsonSourceRevisions.get('park'), 5);
console.log('PASS: unchanged polygon source data is not submitted to MapLibre again');
