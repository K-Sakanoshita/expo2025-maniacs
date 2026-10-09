const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const stub = class {};
const pois = new Map([
    ['way/park', { lnglat: [135.5, 34.7] }],
    ['node/equipment', { lnglat: [135.51, 34.71] }],
    ['node/unlinked', { lnglat: [136, 35] }]
]);
let areaId;
let areaRecord;
const context = vm.createContext({ console, URL, Date,
    window: { navigator: { language: 'ja' }, areaFeatureLinker: {
        resolveAreaId: id => areaId || id, getAreaRecord: () => areaRecord
    } },
    IndoorControl: stub, Glottologist: class { get(key) {
        return { directions_open: '経路を検索', directions_google_maps: 'Googleマップで経路を開く（外部サイト）' }[key] || key;
    } },
    Basic: stub, PoiStatusCont: stub, OverPassControl: stub, Maplibre: stub,
    GeoCont: stub, ListTable: stub, PoiCont: class {
        get_osmid(id) { return pois.get(id); }
        getCatnames() { return ['Park', '']; }
    },
    PlaygroundModelFactories: {}, MapFeature3D: stub, GoogleSpreadSheet: stub,
    NewsTicker: stub, HistoricalNewsController: stub, ChangeController: stub,
    AreaFeatureLinker: class { resolveAreaId(id) { return areaId || id; } getAreaRecord() { return areaRecord; } }, AreaSearchController: stub, ListActionButtons: stub
});
vm.runInContext(fs.readFileSync('cmapmaker.js', 'utf8')
    + '\nthis.maker = cMapMaker;', context);
context.Conf = { directions: { use: true }, etc: { localSave: '' } };
const destination = id => new URL(context.maker.getDirectionsUrl(id)).searchParams.get('destination');
assert.equal(destination('way/park'), '34.7,135.5');
areaId = 'way/park';
assert.equal(destination('node/equipment'), '34.7,135.5', 'linked equipment routes to its configured parent area');
areaId = undefined;
assert.equal(destination('node/unlinked'), '35,136', 'unlinked features route to themselves');
areaId = 'missing/area';
areaRecord = { lng: 135.6, lat: 34.8 };
assert.equal(destination('node/equipment'), '34.8,135.6', 'area record supplies a destination if parent POI is absent');
areaRecord = { lng: null, lat: null };
assert.equal(destination('node/equipment'), '34.71,135.51', 'invalid parent coordinates fall back to the selected feature');
areaRecord = undefined;
areaId = undefined;
for (const lnglat of [[null, null], ['', ''], [Infinity, 35], [181, 35], [135, 91], [NaN, 35]]) {
    pois.set('invalid', { lnglat });
    assert.equal(context.maker.getDirectionsUrl('invalid'), '');
}
assert.equal(context.maker.getDirectionsUrl('missing'), '');
pois.set('zero', { lnglat: [0, 0] });
assert.equal(destination('zero'), '0,0');
const url = new URL(context.maker.getDirectionsUrl('way/park'));
assert.equal(url.origin, 'https://www.google.com');
assert.equal(url.searchParams.get('api'), '1');
assert(!url.searchParams.has('origin'), 'device location belongs to the external map application');
assert(!url.searchParams.has('dir_action'), 'opening a route must not start navigation automatically');
vm.runInContext(fs.readFileSync('detail/osmbasic.js', 'utf8') + '\nthis.detail = new OSMbasic();', context);
const html = context.detail.make({ id: 'way/park' });
assert.match(html, /経路を検索/);
assert.match(html, /destination=34.7%2C135.5/);
assert.match(html, /target="_blank" rel="noopener noreferrer"/);
assert.match(html, /Googleマップで経路を開く（外部サイト）/);
context.Conf.directions.use = false;
assert.equal(context.maker.getDirectionsUrl('way/park'), '');
assert.doesNotMatch(context.detail.make({ id: 'way/park' }), /経路を検索/);
console.log('PASS: parent/selected destinations, invalid coordinates, zero coordinates, route preview, external link and disabled configuration');
