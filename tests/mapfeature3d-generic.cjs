const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ console,
    maplibregl: { MercatorCoordinate: { fromLngLat: () => ({ x: 0, y: 0, meterInMercatorCoordinateUnits: () => 1 }) } }
});
vm.runInContext(fs.readFileSync('lib/mapfeature3d.js', 'utf8') + '\nthis.MapFeature3D = MapFeature3D;', context);
const cases = {
    information_board: { tourism: 'information', information: 'board' },
    monument: { historic: 'monument' },
    statue: { tourism: 'artwork', artwork_type: 'statue' },
    torii: { man_made: 'torii' },
    lantern: { man_made: 'lamp' },
    bollard: { barrier: 'bollard' },
    manhole: { man_made: 'manhole' },
    fire_hydrant: { emergency: 'fire_hydrant' },
    power_pole: { power: 'pole' }
};
const renderer = new context.MapFeature3D();
renderer.configure({ use: true,
    models: Object.fromEntries(Object.keys(cases).map(key => [key, { url: `./${key}.glb`, size: 1 }])),
    rules: Object.entries(cases).map(([model, tags]) => ({ model, tags })) });
renderer.ready = true;
renderer.map = { getLayer: () => true, getCenter: () => [0, 0], getZoom: () => 19,
    getBounds: () => ({ contains: ([lng]) => lng >= 0 }), triggerRepaint() {} };
renderer.modelGroup = { children: [], clear() { this.children = []; }, add(object) { this.children.push(object); } };
const clone = () => ({ position: { set() {} }, scale: { setScalar() {} }, userData: {}, traverse() {} });
for (const [key, tags] of Object.entries(cases)) {
    assert.equal(renderer.getModelKey(tags), key);
    renderer.templates.set(key, { clone });
}
const features = Object.entries(cases).map(([id, properties]) => ({ type: 'Feature', id,
    geometry: { type: 'Point', coordinates: [0, 0] }, properties }));
renderer.sync(features);
assert.equal(renderer.modelGroup.children.length, 9, 'all configured non-playground Point features render');
for (const feature of features) assert.equal(renderer.hasModel(feature.id), true);
assert.deepEqual(renderer.modelGroup.children.map(item => item.userData.featureId), Object.keys(cases));
renderer.sync([{ ...features[0], id: 0 }]);
assert.equal(renderer.hasModel(0), true, 'numeric GeoJSON IDs, including zero, remain selectable');
assert.equal(renderer.modelGroup.children[0].userData.featureId, '0');
renderer.sync([{ ...features[0], id: 'outside', geometry: { type: 'Point', coordinates: [-1, 0] } }]);
assert.equal(renderer.hasModel('outside'), false);
renderer.templates.delete('monument');
renderer.sync([features[1]]);
assert.equal(renderer.hasModel('monument'), false, 'missing models leave the feature eligible for icon fallback');
renderer.sync([{ geojson: { ...features[0], id: 'area', geometry: { type: 'Polygon', coordinates: [] } }, lnglat: [0, 0] }]);
assert.equal(renderer.hasModel('area'), true, 'polygon representatives remain supported');
renderer.configure({ use: true, models: { bar: { type: 'horizontal_bar', size: 1 } }, rules: [] });
assert.equal(renderer.modelDefs.bar, undefined, 'the core has no built-in playground model types');
const factory = () => clone();
const custom = new context.MapFeature3D({ modelFactories: { custom_shape: factory } });
custom.configure({ use: true, models: { custom: { type: 'custom_shape', size: 2 } },
    rules: [{ tags: { any_tag: 'any_value' }, model: 'custom' }] });
assert.equal(custom.getModelKey({ any_tag: 'any_value' }), 'custom');
assert.equal(custom.modelDefs.custom.type, 'custom_shape');
assert.equal(custom.modelFactories.get('custom_shape'), factory);
console.log('PASS: nine non-playground feature types, direct GeoJSON, polygon positions, fallback and external model factories');
