const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let conversions = 0;
const config = { renderer: 'linear-extrusion', stroke: '#606060', 'stroke-width': 2,
    'fill-opacity': 0.5, extrusion: { minzoom: 16, height: 1.5, width: 0.2,
        styles: { wall: { color: '#606060', opacity: 1 }, fence: { color: '#71808a', opacity: 0.45 } } } };
const context = vm.createContext({ console,
    Conf: { osm: { generic_barriers: { expression: config } } },
    cMapMaker: { getPoiZoom: () => 13 },
    turf: { buffer(feature, radius, options) {
        conversions++;
        assert.equal(options.units, 'meters');
        assert(radius > 0);
        assert.equal(feature.geometry.type, 'MultiLineString');
        return { geometry: { type: 'Polygon', coordinates: [
            [[135, 34], [135.001, 34], [135.001, 34.0001], [135, 34]]
        ] } };
    } }
});
vm.runInContext(fs.readFileSync('lib/maplib.js', 'utf8') + '\nthis.lib = new Maplibre();', context);
const lib = context.lib;
assert.equal(lib.parseLinearDimension('200 cm', 1), 2);
assert(Math.abs(lib.parseLinearDimension('6 ft', 1) - 1.8288) < 1e-9);
assert.equal(lib.parseLinearDimension('1.8m', 1), 1.8);
for (const value of ['unknown', '-2', 'Infinity', '0', '1;2']) assert.equal(lib.parseLinearDimension(value, 1.5), 1.5);
const line = { type: 'LineString', coordinates: [[135, 34], [135, 34], [135.001, 34]] };
const data = { type: 'FeatureCollection', features: [
    { id: 'way/1', properties: { barrier: 'wall', height: '2 m', width: '40cm' }, geometry: line },
    { id: 'way/2', properties: { barrier: 'fence' }, geometry: line },
    { id: 'node/3', properties: { barrier: 'fence' }, geometry: { type: 'Point', coordinates: [135, 34] } },
    { id: 'way/4', properties: { height: '1', min_height: '2' }, geometry: line }
] };
const result = lib.buildLinearExtrusionData(data, 'generic_barriers', config.extrusion);
assert.equal(result.features.length, 2);
assert.equal(result.features[0].properties._linearHeight, 2);
assert.equal(result.features[1].properties._linearHeight, 1.5);
assert.equal(result.features[1].properties._linearStyle, 'fence');
assert.equal(result.features[1].properties._linearColor, '#71808a');
assert.equal(conversions, 2);
lib.buildLinearExtrusionData(data, 'generic_barriers', config.extrusion);
assert.equal(conversions, 2, 'cached geometries are reused');
assert.equal(data.features[0].geometry.coordinates.length, 3, 'OSM geometry is untouched');
const sources = new Map(), layers = new Map();
let updates = 0;
lib.map = {
    getSource: id => sources.get(id),
    addSource(id, options) { sources.set(id, { data: options.data, setData(data) { updates++; this.data = data; } }); },
    getLayer: id => layers.get(id), addLayer(layer) { layers.set(layer.id, layer); }
};
lib.addPolygon(data, 'generic_barriers', '', 1);
assert.equal(layers.get('generic_barriers-lines').maxzoom, 16);
assert.equal(layers.get('generic_barriers-extrusion-wall').minzoom, 16);
assert.equal(layers.get('generic_barriers-extrusion-wall').paint['fill-extrusion-opacity'], 1);
assert.equal(layers.get('generic_barriers-extrusion-fence').paint['fill-extrusion-opacity'], 0.45);
assert.equal(sources.get('generic_barriers-extrusion-source').data.features.length, 2);
lib.addPolygon(data, 'generic_barriers', '', 1);
assert.equal(updates, 0, 'same revision does not resubmit data');
lib.addPolygon({ type: 'FeatureCollection', features: [] }, 'generic_barriers', '', 2);
assert.equal(updates, 2);
assert.equal(lib.linearExtrusionCache.get('generic_barriers').size, 0, 'removed geometry is evicted');
assert.equal(sources.get('generic_barriers-extrusion-source').data.features.length, 0);
console.log('PASS: generic linear extrusion uses tag dimensions, style variants, low-zoom lines, geometry caching and removal without changing OSM data');
