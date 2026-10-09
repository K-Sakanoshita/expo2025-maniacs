const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const requests = [];
let bbox = '135,34,136,35';
let pending = null;
const stub = class {};
const context = {
    console: { ...console, log() {}, warn() {} },
    URL,
    location: { href: 'https://example.test/map/' },
    window: { navigator: { language: 'ja' } },
    IndoorControl: stub,
    Glottologist: stub, Basic: stub, PoiStatusCont: stub,
    OverPassControl: stub, Maplibre: stub, GeoCont: stub, ListTable: stub,
    PoiCont: stub, PlaygroundModelFactories: {}, MapFeature3D: stub, GoogleSpreadSheet: stub,
    NewsTicker: stub, HistoricalNewsController: stub, ChangeController: stub, AreaFeatureLinker: stub, AreaSearchController: stub,
    ListActionButtons: stub
};
vm.createContext(context);
vm.runInContext(`${fs.readFileSync('cmapmaker.js', 'utf8')}\nglobalThis.fixture = { cMapMaker, poiCont, gSheet, areaSearchController };`, context);
const { cMapMaker, poiCont, gSheet, areaSearchController } = context.fixture;
context.Conf = {
    activity: { authMode: 'basic', url: 'https://example.test/api/activities.php?app=playgrounds' },
    poiView: { poiActLoad: false }, static: { use: false }
};
areaSearchController.searchBbox = () => bbox;
gSheet._isGAS = () => false;
gSheet.get = url => {
    requests.push(new URL(url));
    return pending ? pending() : Promise.resolve([{ id: `a${requests.length}`, osmid: 'node/1' }]);
};
poiCont.setActdata = rows => { poiCont.adata = rows; };
poiCont.setActlnglat = () => {};

(async () => {
    assert.strictEqual(await cMapMaker.loadActivitiesForView(), true);
    assert.strictEqual(requests[0].searchParams.get('bbox'), '135,34,136,35');
    assert.strictEqual(requests[0].searchParams.get('app'), 'playgrounds');
    assert.strictEqual(await cMapMaker.loadActivitiesForView(), false);
    assert.strictEqual(requests.length, 1);
    bbox = '136,34,137,35';
    assert.strictEqual(await cMapMaker.loadActivitiesForView(), true);
    assert.strictEqual(requests[1].searchParams.get('bbox'), bbox);
    assert.deepStrictEqual(poiCont.adata.map(row => row.id), ['a2']);

    let resolveOld;
    bbox = '137,34,138,35';
    pending = () => new Promise(resolve => { resolveOld = resolve; });
    const old = cMapMaker.loadActivitiesForView();
    bbox = '138,34,139,35';
    pending = () => Promise.resolve([{ id: 'new', osmid: 'node/2' }]);
    assert.strictEqual(await cMapMaker.loadActivitiesForView(), true);
    resolveOld([{ id: 'old', osmid: 'node/3' }]);
    assert.strictEqual(await old, false);
    assert.deepStrictEqual(poiCont.adata.map(row => row.id), ['new']);

    bbox = '139,34,140,35';
    pending = () => Promise.reject(new Error('network'));
    assert.strictEqual(await cMapMaker.loadActivitiesForView(), false);
    assert.deepStrictEqual(poiCont.adata.map(row => row.id), ['new']);
    assert.strictEqual(cMapMaker.lastActivityBbox, '138,34,139,35');
    pending = null;
    assert.strictEqual(await cMapMaker.loadActivitiesForView(), true);
    assert.strictEqual(requests.at(-1).searchParams.get('bbox'), bbox);
    bbox = null;
    assert.strictEqual(await cMapMaker.loadActivitiesForView(), true);
    assert.strictEqual(requests.at(-1).searchParams.get('bbox'), '-180,-90,180,90');
    context.Conf.activity.authMode = 'legacy';
    assert.strictEqual(await cMapMaker.loadActivitiesForView(), false);
    assert.strictEqual(requests.length, 7);
    console.log('PASS: Activity BBOX loading, move, stale response, retry, legacy mode');
})().catch(error => { console.error(error); process.exitCode = 1; });
