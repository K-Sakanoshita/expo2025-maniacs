const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const colors = Object.fromEntries(['attention', 'green', 'middle', 'normal', 'visited']
    .map(type => [type, { fill: '#ffffff', stroke: '#888888' }]));
colors.favorite = { badgeColor: '#d14970' };
colors.hover = { enabled: false };
const sources = new Map();
const layers = new Map();
const map = {
    getSource: id => sources.get(id),
    addSource: (id, options) => sources.set(id, {
        data: options.data, setData(data) { this.data = data; }
    }),
    getLayer: id => layers.get(id),
    addLayer: layer => layers.set(layer.id, layer),
    on() {}
};
const poi = { geojson: {
    id: 'node/1', type: 'Feature', geometry: { type: 'Point', coordinates: [135, 34] },
    properties: { tags: { id: 'node/1', name: 'Test' } }
}, targets: ['park'], lnglat: [135, 34] };
let favorite = false;
let hasModel = false;
const context = vm.createContext({
    console, structuredClone,
    Conf: {
        activity: { targetName: 'activity' }, activities: {},
        indoor: { use: false }, map: { openNow: false }, etc: { reverseIcon: false },
        osm: { park: { expression: { poiView: true } } },
        poiView: { editZoom: {} },
        icon: { markerColors: colors, zoomSteps: {
            marker: { baseScale: 1, steps: [] }, shadow: { baseScale: 1, steps: [] }
        }, shadow: 1, attention: 1, green: 1, middle: 1, normal: 1, visited: 1,
        textViewZoom: 14, textSize: 12, textFont: ['Noto Sans'] }
    },
    PoiStatusIndex: { VISITED: 0, FAVORITE: 1, MEMO: 2 },
    poiStatusCont: { getValueByOSMID: () => [false, favorite, ''] },
    mapLibre: { map, getZoom: () => 18, get_LL: () => ({}) },
    geoCont: { checkInner: () => true },
    cMapMaker: { isPoiVisibleInLevelMode: () => true, getPoiZoom: () => 12 },
    feature3d: { sync() {}, hasModel: () => hasModel, placeBelowMarkerLayers() {} },
    glot: { lang: 'ja' }
});
vm.runInContext(fs.readFileSync('lib/poilib.js', 'utf8') + '\nthis.PoiCont = PoiCont;', context);
const controller = new context.PoiCont();
controller.getTargets = () => ['park'];
controller.get_osmid = () => poi;
controller.getActlistByOsmid = () => [];
controller.getOSMname = () => 'Test';
context.poiCont = controller;
controller.setPoi([['node/1']], false);
assert.equal(sources.has('marker-favorite'), false);
assert.equal(layers.has('marker-favorite'), false);
favorite = true;
controller.setPoi([['node/1']], false);
assert.equal(sources.get('marker-favorite').data.features.length, 1);
assert.equal(sources.get('marker-favorite').data.features[0].id, 'node/1');
assert.equal(layers.get('marker-bg-normal').paint['circle-color'], '#ffffff');
assert.equal(layers.get('marker-favorite').layout['text-field'], '♥');
assert.equal(layers.get('marker-favorite').paint['text-color'], '#d14970');
favorite = false;
controller.setPoi([['node/1']], false);
assert.equal(sources.get('marker-favorite').data.features.length, 0);
assert.equal([...layers.keys()].filter(id => id.startsWith('marker-favorite')).length, 1);
hasModel = true;
favorite = true;
controller.setPoi([['node/1']], false);
assert.equal(sources.get('marker-normal').data.features.length, 0, '3D objects still replace the ordinary marker');
assert.equal(sources.get('marker-favorite').data.features.length, 1, '3D objects retain their favorite badge');
assert.equal(sources.get('marker-favorite').data.features[0].id, 'node/1');
favorite = false;
controller.setPoi([['node/1']], false);
assert.equal(sources.get('marker-favorite').data.features.length, 0, 'unchecking a 3D favorite clears its badge');
hasModel = false;
favorite = true;
controller.setPoi([['node/1']], false);
assert.equal(sources.get('marker-normal').data.features.length, 1, 'icon fallback is restored');
assert.equal(sources.get('marker-favorite').data.features.length, 1, 'fallback does not duplicate the badge');
console.log('PASS: favorite badges on icons and 3D objects, uncheck, and model fallback');

// Existing generic configurations predate zoomSteps; retain their original sizes.
delete context.Conf.icon.zoomSteps;
layers.clear();
controller.setPoi([['node/1']], false);
assert.deepEqual(JSON.parse(JSON.stringify(layers.get('marker-bg-normal').paint['circle-radius'])),
    ['step', ['zoom'], 24, 16, 28.799999999999997, 17, 33.599999999999994]);
assert.deepEqual(JSON.parse(JSON.stringify(layers.get('marker-fg-normal').layout['icon-size'])),
    ['step', ['zoom'], 0.5, 16, 0.6, 17, 0.7]);
console.log('PASS: marker sizes remain compatible with configurations without zoomSteps');
