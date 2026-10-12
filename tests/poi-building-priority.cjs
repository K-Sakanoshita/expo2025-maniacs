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

const readConfig = path => vm.runInNewContext('(' + fs.readFileSync(path, 'utf8') + ')');
context.Conf.marker = readConfig('data/marker.jsonc').marker;
context.glot.get = () => 'undefined';
const realTags = JSON.parse(fs.readFileSync('data/expo2025.json')).elements
    .find(element => element.type === 'way' && element.id === 1365419673).tags;
for (const lang of ['ja', 'en']) {
    context.Conf.category = readConfig(`data/category-${lang}.jsonc`).category;
    context.Conf.category_keys = Object.keys(context.Conf.category);
    context.Conf.category_sub = {};
    const keysBefore = [...context.Conf.category_keys];
    assert.equal(controller.getCatnames(realTags)[2], 'leisure=bandstand');
    assert.equal(controller.getCatnames({ tags: realTags })[2], 'leisure=bandstand');
    assert.equal(controller.getIcon(realTags), 'music.png');
    assert.equal(controller.getCatnames({ building: 'roof' })[2], 'building=roof');
    assert.equal(controller.getIcon({ building: 'roof' }), 'home.png');
    assert.equal(controller.getIcon({ building: 'roof', leisure: 'unknown-value' }), 'home.png');
    assert.equal(controller.getCatnames({ amenity: 'toilets', building: 'yes' })[2], 'amenity=toilets');
    assert.deepEqual([...context.Conf.category_keys], keysBefore);
}
controller.init(false);
controller.setPoi([['node/1']], false);
const expression = layers.get('marker-fg-normal').layout['icon-image'];
function evaluate(expr, tags) {
    if (!Array.isArray(expr)) return expr;
    if (expr[0] === 'get') return tags[expr[1]];
    if (expr[0] === '==') return evaluate(expr[1], tags) === evaluate(expr[2], tags);
    if (expr[0] === 'all') return expr.slice(1).every(value => evaluate(value, tags));
    if (expr[0] === 'case') {
        for (let i = 1; i < expr.length - 1; i += 2) {
            if (evaluate(expr[i], tags)) return evaluate(expr[i + 1], tags);
        }
        return evaluate(expr.at(-1), tags);
    }
    throw new Error('Unsupported expression: ' + expr[0]);
}
for (const tags of [realTags, { building: 'roof' }, { building: 'roof', leisure: 'unknown-value' },
    { building: 'yes', amenity: 'toilets' }]) {
    assert.equal(evaluate(expression, tags), controller.getIcon(tags));
}
console.log('PASS: building fallback, bandstand/toilet priority, Japanese/English categories and map/list icons');
