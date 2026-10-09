const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
process.env.TZ = 'Asia/Tokyo';

const values = new Map([['test.last-checked-at', '2026-09-26T00:00:00.000Z']]);
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const area = { type: 'FeatureCollection', features: [{ properties: { 'ISO3166-2': 'JP-27', 'name:ja': '大阪府' } }] };
const newItem = { type: 'way', id: 1, name: '新しい公園', tags: '{"leisure":"park"}',
    editorName: 'osm_mapper',
    lng: '135.5', lat: '34.7',
    createdAt: '2026-09-26 12:00:00', date: '2026-09-26 13:00:00' };
const updatedItem = { type: 'way', id: 2, name: '更新された公園', tags: '{"leisure":"park"}',
    editorName: 'another_mapper',
    lon: '135.5474254', lat: '34.4769340',
    createdAt: '2026-08-01 12:00:00', date: '2026-09-26 13:00:00' };
let failed = false;
const requests = [];
const fetch = async url => {
    requests.push(url);
    if (failed && url.includes('mode=objects')) return { ok: false, status: 500 };
    if (url.endsWith('.geojson')) return { ok: true, json: async () => area };
    const params = new URL(url).searchParams;
    const items = params.get('mode') === 'objects' ? [updatedItem]
        : params.has('created_from') ? [newItem, newItem] : [updatedItem, newItem];
    return { ok: true, json: async () => ({ meta: { nextCursor: null }, items }) };
};
const context = { URL, Date, console, location: { href: 'https://example.org/' },
    mapLibre: { map: { getCenter: () => ({ lng: 135, lat: 34 }) } },
    turf: { point: x => x, booleanPointInPolygon: () => true },
    Conf: { etc: { localSave: 'playgrounds' } },
    poiStatusCont: { getAllFavorite: () => [['playgrounds.way/2', { favorite: true }]] },
    window: { fetch, localStorage: storage } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('lib/changecontroller.js', 'utf8') + '\nthis.ChangeController = ChangeController', context);
const controller = new context.ChangeController({ use: true, apiUrl: 'https://api.example.org/api.php',
    storageKeyPrefix: 'test', region: { scope: 'prefecture', source: 'mapCenter', prefectureFile: 'https://api.example.org/prefectures.geojson' },
    targets: [{ id: 'park', label: '公園', use: true,
        notify: { regionalCreated: true, regionalUpdated: true, favoriteUpdated: true },
        queries: [{ tag_key: 'leisure', tag_value: 'park' }] }] },
{ fetch, storage, now: () => new Date('2026-09-27T00:00:00.000Z') });
(async () => {
    const outcome = await controller.checkOnStartup();
    assert.equal(outcome.state, 'changes');
    assert.equal(outcome.results.length, 3); // new, updated, favorite updated; duplicate query result removed
    assert(requests.some(url => url.includes('mode=objects') && url.includes('way%2F2')));
    assert(requests.some(url => url.includes('created_from=2026-08-27') && url.includes('created_to=2026-09-27')));
    assert(requests.some(url => url.includes('from=2026-08-27') && url.includes('to=2026-09-27')));
    assert.equal(controller.read(controller.key('last-checked-at')), '2026-09-27T00:00:00.000Z');
    const tickerItems = controller.tickerItems(3);
    assert.equal(tickerItems.length, 3);
    const newEntry = tickerItems.find(item => item.osmId === 'way/1');
    assert.equal(newEntry.name, '新しい公園');
    assert.equal(newEntry.kind, 'regionalCreated');
    assert.equal(JSON.stringify(newEntry.coordinates), '[135.5,34.7]');
    assert.equal(newEntry.editorName, 'osm_mapper');
    context.poiCont = { getCatnames: tags => {
        assert.equal(tags.playground, 'slide');
        return ['すべり台'];
    } };
    const categoryController = new context.ChangeController({}, { fetch, storage });
    categoryController.results = [{kind:'regionalCreated',target:{label:'遊具'},
        item:{type:'node',id:10,tags:'{"playground":"slide"}'}}];
    assert.equal(categoryController.tickerItems()[0].name, 'すべり台');
    delete context.poiCont;
    assert(tickerItems.some(item => item.headline.includes('新しい公園')
        && item.url === 'https://www.openstreetmap.org/way/1'));
    const requestsBeforeCache = requests.length;
    const cachedController = new context.ChangeController(controller.config,
        { fetch, storage, now: () => new Date('2026-09-27T00:00:00.000Z') });
    assert.equal((await cachedController.checkOnStartup()).state, 'already');
    assert.equal(cachedController.tickerItems().length, 3);
    assert.equal(requests.length, requestsBeforeCache + 1); // Prefecture data only; no OSM query.
    assert.equal(JSON.stringify(cachedController.tickerItems().find(item => item.osmId === 'way/1').coordinates), '[135.5,34.7]');
    values.delete('test.osm-cache-version');
    const beforeMigration=requests.length;
    assert.equal((await cachedController.checkOnStartup()).state,'changes');
    assert(requests.length>beforeMigration);
    assert.equal(cachedController.tickerItems().find(item=>item.osmId==='way/1').editorName,'osm_mapper');
    assert.equal(values.get('test.osm-cache-version'),'2');
    const beforeSameRegion = requests.length;
    await cachedController.checkOnStartup();
    assert.equal(requests.length, beforeSameRegion);
    cachedController.region = async () => ({code:'28',name:'兵庫県'});
    assert.equal((await cachedController.checkOnStartup()).state, 'changes');
    assert.equal(values.get('test.last-region'),'28');
    assert(requests.slice(beforeSameRegion).some(url => new URL(url).searchParams.get('prefecture_code') === '28'));
    values.set('test.last-region','27');
    const savedResults = values.get('test.last-results');
    const legacyResults = JSON.parse(savedResults).filter(result => result.item.id === 2);
    legacyResults.forEach(result => { delete result.item.lat; delete result.item.lon; });
    values.set('test.last-results', JSON.stringify(legacyResults));
    const oldCacheController = new context.ChangeController(controller.config,
        { fetch, storage, now: () => new Date('2026-09-27T00:00:00.000Z') });
    await oldCacheController.checkOnStartup();
    assert.equal(JSON.stringify(oldCacheController.tickerItems()[0].coordinates), '[135.5474254,34.476934]');
    assert.equal(JSON.parse(values.get('test.last-results'))[0].item.lon, '135.5474254');
    assert.equal(oldCacheController.coordinates({ lon: null, lat: null }), null);
    values.set('test.last-results', savedResults);
    const legacyValues = new Map([['test.last-checked-at', '2026-09-26T00:00:00.000Z'],
        ['test.last-shown-date', '2026-09-27']]);
    const legacyStorage = { getItem: key => legacyValues.get(key) ?? null,
        setItem: (key, value) => legacyValues.set(key, value) };
    const requestsBeforeLegacy = requests.length;
    const legacyController = new context.ChangeController(controller.config,
        { fetch, storage: legacyStorage, now: () => new Date('2026-09-27T00:00:00.000Z') });
    assert.equal((await legacyController.checkOnStartup()).state, 'changes');
    assert(requests.length > requestsBeforeLegacy);
    assert(legacyStorage.getItem('test.last-results'));
    values.delete(controller.key('last-shown-date'));
    values.set(controller.key('last-checked-at'), '2026-09-26T00:00:00.000Z');
    const firstValues = new Map();
    const firstStorage = { getItem: key => firstValues.get(key) ?? null,
        setItem: (key, value) => firstValues.set(key, value) };
    const requestsBeforeFirst = requests.length;
    const firstController = new context.ChangeController(controller.config,
        { fetch, storage: firstStorage, now: () => new Date('2026-09-27T00:00:00.000Z') });
    assert.equal((await firstController.checkOnStartup()).state, 'changes');
    assert(requests.length > requestsBeforeFirst);
    assert.equal(firstStorage.getItem('test.last-checked-at'), '2026-09-27T00:00:00.000Z');
    const monthEnd = new Date('2026-03-31T03:00:00.000Z');
    assert.equal(new Date(controller.monthsAgo(monthEnd, 1)).toISOString(), '2026-02-28T03:00:00.000Z');
    assert.equal(new Date(controller.lookbackStart(monthEnd, null)).toISOString(), '2026-02-28T03:00:00.000Z');
    assert.equal(new Date(controller.lookbackStart(monthEnd, Date.parse('2026-01-15T03:00:00Z'))).toISOString(),
        '2026-01-15T03:00:00.000Z');
    assert.equal(new Date(controller.lookbackStart(monthEnd, Date.parse('2025-01-01T00:00:00Z'))).toISOString(),
        '2025-09-30T03:00:00.000Z');
    const oldStorageValues = new Map([['test.last-checked-at', '2025-01-01T00:00:00.000Z']]);
    const oldStorage = { getItem: key => oldStorageValues.get(key) ?? null,
        setItem: (key, value) => oldStorageValues.set(key, value) };
    const sixMonthRequests = [];
    const sixMonthController = new context.ChangeController(controller.config,
        { fetch: async url => { sixMonthRequests.push(url); return fetch(url); }, storage: oldStorage,
            now: () => monthEnd });
    assert.equal((await sixMonthController.checkOnStartup()).state, 'changes');
    assert(sixMonthRequests.some(url => url.includes('created_from=2025-09-30')));
    assert(sixMonthRequests.some(url => url.includes('from=2025-09-30')));
    failed = true;
    const error = await controller.checkOnStartup();
    assert.equal(error.state, 'error');
    assert.equal(controller.read(controller.key('last-checked-at')), '2026-09-26T00:00:00.000Z');
    assert.equal(controller.read(controller.key('last-shown-date')), null);
    const storedBeforePreview = [...values];
    const requestsBeforePreview = requests.length;
    const mockResults = controller.previewRandom(10);
    assert.equal(mockResults.length, 10);
    assert.equal(controller.tickerItems().length, 10);
    assert(controller.tickerItems().every(item => item.url === ''));
    assert.equal(new Set(mockResults.map(result => result.id)).size, 10);
    assert(mockResults.every(result => result.id.startsWith('mock/')
        && result.item.name.startsWith('【テスト】')
        && result.kind === 'regionalCreated' && result.target.notify[result.kind]));
    assert.deepEqual([...values], storedBeforePreview);
    assert.equal(requests.length, requestsBeforePreview);
    assert.throws(() => controller.previewRandom(31), { name: 'RangeError' });
    console.log('PASS: change classification, deduplication, favorites, retry, and isolated mock preview');
})().catch(error => { console.error(error); process.exitCode = 1; });
