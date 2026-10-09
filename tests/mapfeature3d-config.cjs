const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ console });
const feature3dSource = fs.readFileSync(path.join(__dirname, '../lib/mapfeature3d.js'), 'utf8');
vm.runInContext(feature3dSource + '\nthis.MapFeature3D = MapFeature3D;', context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../lib/playgroundmodels3d.js'), 'utf8') + '\nthis.PlaygroundModelFactories = PlaygroundModelFactories;', context);
assert.match(feature3dSource, /renderingMode:\s*["']2d["']/);
const make = options => {
    const layer = new context.MapFeature3D({ modelFactories: context.PlaygroundModelFactories });
    layer.configure(options);
    return layer;
};
const models = {
    slide: { url: './slide.glb', size: 4 },
    dome: { url: './playground_dome.glb', size: 4 },
    sandpit: { url: './sandbox-hene/scene.gltf', size: 3 },
    covered: { url: './covered.glb', size: 6 },
    seesaw: { url: './seesaw.glb', size: 4 },
    basket_swing: { type: 'basket_swing', size: 1 },
    horizontal_bar: { type: 'horizontal_bar', size: 1 },
    springy: { type: 'springy', size: 1 },
    bench: { url: './bench/scene.gltf', size: 2 },
    drinking_water: { url: './drinking-water.gltf', size: 1.2, scaleBelowZoom: 19, maxZoomScale: 4 },
    vending_machine: { url: './vending-machine/scene.gltf', size: 1.9, scaleBelowZoom: 19, maxZoomScale: 4 }
};
const rules = [
    { tags: { playground: 'slide', covered: 'yes' }, model: 'covered' },
    { tags: { playground: ['slide', 'chute'] }, model: 'slide' },
    { tags: { playground: 'dome' }, model: 'dome' },
    { tags: { playground: ['sandpit', 'sandbox'] }, model: 'sandpit' },
    { tags: { playground: 'seesaw' }, model: 'seesaw' },
    { tags: { playground: ['basketswing', 'basket_swing'] }, model: 'basket_swing' },
    { tags: { playground: 'horizontal_bar' }, model: 'horizontal_bar' },
    { tags: { playground: 'springy' }, model: 'springy' },
    { tags: { amenity: 'bench' }, model: 'bench' },
    { tags: { amenity: 'drinking_water' }, model: 'drinking_water' },
    { tags: { amenity: 'vending_machine' }, model: 'vending_machine' }
];
const layer = make({ use: true, models, rules });
assert.deepEqual(
    JSON.parse(JSON.stringify(layer.getHitAreaDimensions({ x: 0.2, y: 2, z: 0.3 }, 1))),
    { width: 1.2, height: 2.7, depth: 1.2, centerY: 1 }
);
const customHitArea = make({ use: true, hitArea: { padding: 0.5, minSize: 2 }, models, rules });
assert.deepEqual(
    JSON.parse(JSON.stringify(customHitArea.getHitAreaDimensions({ x: 1, y: 1, z: 3 }, 1))),
    { width: 2, height: 2, depth: 4, centerY: 0.5 }
);
assert.equal(make({ use: true, hitArea: { use: false }, models, rules }).hitArea.use, false);
assert.equal(layer.getModelKey({ playground: 'slide', covered: 'yes' }), 'covered');
assert.equal(layer.getModelKey({ playground: 'slide', covered: 'no' }), 'slide');
assert.equal(layer.getModelKey({ playground: 'CHUTE' }), 'slide');
assert.equal(layer.getModelKey({ playground: 'dome' }), 'dome');
assert.equal(layer.getModelKey({ playground: 'sandbox' }), 'sandpit');
assert.equal(layer.getModelKey({ playground: 'seesaw' }), 'seesaw');
assert.equal(layer.getModelKey({ playground: 'basketswing' }), 'basket_swing');
assert.equal(layer.getModelKey({ playground: 'basket_swing' }), 'basket_swing');
assert.equal(layer.getModelKey({ playground: 'horizontal_bar' }), 'horizontal_bar');
assert.equal(layer.getModelKey({ playground: 'springy' }), 'springy');
assert.equal(layer.getModelKey({ playground: 'swing' }), undefined);
assert.equal(layer.getModelKey({ name: 'slide' }), undefined);
assert.equal(layer.getModelKey({ amenity: 'bench' }), 'bench');
assert.equal(layer.getModelKey({ amenity: 'DRINKING_WATER' }), 'drinking_water');
assert.equal(layer.getModelKey({ amenity: 'vending_machine' }), 'vending_machine');
assert.deepEqual(JSON.parse(JSON.stringify(layer.getSelectionIds('way/1', 'node/2'))), ['way/1', 'node/2']);
assert.deepEqual(JSON.parse(JSON.stringify(layer.getSelectionIds('node/2', 'node/2'))), ['node/2']);
assert.equal(layer.modelDefs.covered.url, './covered.glb');
assert.equal(layer.modelDefs.covered.size, 6);
assert.equal(layer.modelDefs.dome.url, './playground_dome.glb');
assert.equal(layer.modelDefs.sandpit.url, './sandbox-hene/scene.gltf');
assert.equal(layer.modelDefs.basket_swing.type, 'basket_swing');
assert.equal(layer.modelDefs.horizontal_bar.type, 'horizontal_bar');
assert.equal(layer.modelDefs.springy.type, 'springy');
assert.equal(layer.visualScale, 1.2);
assert.equal(make({ use: true, visualScale: 1.5, models, rules }).visualScale, 1.5);
assert.equal(layer.modelDefs.bench.url, './bench/scene.gltf');
assert.equal(layer.modelDefs.vending_machine.url, './vending-machine/scene.gltf');
assert.equal(layer.getZoomScale(layer.modelDefs.vending_machine, 17), 4);
assert.equal(layer.getZoomScale(layer.modelDefs.vending_machine, 18), 2);
assert.equal(layer.getZoomScale(layer.modelDefs.vending_machine, 19), 1);
assert.equal(layer.getZoomScale(layer.modelDefs.vending_machine, 20), 1);
assert.equal(layer.getZoomScale(layer.modelDefs.slide, 17), 1);
assert.equal(make({ use: true, models, rules: [{ tags: { amenity: 'bench' }, model: 'slide' }] }).getModelKey({ amenity: 'bench' }), 'slide');
assert.equal(make({ use: true, models, rules: [{ ...rules[1], use: false }] }).getModelKey({ playground: 'slide' }), undefined);
assert.equal(make({ use: true, models: { slide: { ...models.slide, use: false } }, rules }).rules.length, 0);
for (const bad of [0, -1, Infinity, '4', null]) {
    assert.equal(make({ use: true, models: { slide: { url: './slide.glb', size: bad } }, rules }).rules.length, 0);
}
for (const tags of [{}, null, { playground: [] }, { playground: '' }, { playground: {} }]) {
    assert.equal(make({ use: true, models, rules: [{ tags, model: 'slide' }] }).rules.length, 0);
}
assert.equal(make({ use: true, models, rules: [{ tags: { playground: 'slide' }, model: 'missing' }] }).rules.length, 0);
assert.equal(make({ use: true, models: { custom: { type: 'unknown', size: 1 } }, rules: [] }).modelDefs.custom, undefined);
assert.equal(layer.supportsHoverInteraction(), true); // non-browser test context keeps desktop-compatible fallback
context.window = { matchMedia: () => ({ matches: false }) };
assert.equal(layer.supportsHoverInteraction(), false);
context.window.matchMedia = () => ({ matches: true });
assert.equal(layer.supportsHoverInteraction(), true);
let movedLayer;
layer.map = {
    getLayer: id => id === layer.layerId,
    getStyle: () => ({ layers: [
        { id: 'background' },
        { id: 'marker-shadow' },
        { id: layer.layerId }
    ] }),
    moveLayer: (id, beforeId) => { movedLayer = [id, beforeId]; }
};
assert.equal(layer.placeBelowMarkerLayers(), true);
assert.deepEqual(movedLayer, [layer.layerId, 'marker-shadow']);
layer.map.getStyle = () => ({ layers: [
    { id: 'background' },
    { id: layer.layerId },
    { id: 'marker-shadow' }
] });
assert.equal(layer.placeBelowMarkerLayers(), false);
// Exercise replacement/fallback through sync, using minimal rendering adapters.
context.maplibregl = { MercatorCoordinate: { fromLngLat: () => ({ x: 0, y: 0, meterInMercatorCoordinateUnits: () => 1 }) } };
layer.ready = true;
layer.map = { getLayer: () => true, getCenter: () => [0, 0], getZoom: () => 17, getBounds: () => ({ contains: () => true }), triggerRepaint() {} };
let clearCount = 0;
let slideCloneCount = 0;
layer.modelGroup = { children: [], clear() { clearCount++; this.children = []; }, add(o) { this.children.push(o); } };
layer.templates.set('slide', { clone: () => {
    slideCloneCount++;
    return { position: { set() {} }, scale: { setScalar() {} }, userData: {}, traverse() {} };
} });
const poi = { geojson: { id: 'node/1', properties: { playground: 'slide' } }, lnglat: [0, 0] };
layer.sync([poi]);
assert.equal(layer.hasModel('node/1'), true);
layer.sync();
assert.equal(clearCount, 1); // identical consecutive sync is skipped
assert.equal(slideCloneCount, 1);
let appliedZoomScale;
layer.templates.set('vending_machine', {
    clone: () => ({
        position: { set() {} },
        scale: { setScalar(value) { appliedZoomScale = value; } },
        userData: {},
        traverse() {}
    })
});
layer.sync([{ geojson: { id: 'node/2', properties: { amenity: 'vending_machine' } }, lnglat: [0, 0] }]);
assert.equal(appliedZoomScale, 4);
assert.equal(layer.hasModel('node/2'), true);
layer.sync([]);
assert.equal(layer.hasModel('node/1'), false);
layer.templates.clear();
layer.sync([poi]);
assert.equal(layer.hasModel('node/1'), false);
(async () => {
    const disabled = new context.MapFeature3D({ modelFactories: context.PlaygroundModelFactories });
    assert.equal(await disabled.init({}, { use: false, models, rules }), false);
    assert.equal(disabled.loading, null); // No Three.js/model request.
    const empty = new context.MapFeature3D({ modelFactories: context.PlaygroundModelFactories });
    assert.equal(await empty.init({}, { use: true, models: {}, rules: [] }), false);
    assert.equal(empty.loading, null);
    console.log('PASS: configurable tags/models, priority, AND/OR, disabled/invalid entries, replacement and fallback');
})().catch(error => { console.error(error); process.exitCode = 1; });
