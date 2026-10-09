const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const calls = [];
class Ticker {
    init(container, config) { calls.push(['init', container, config]); }
    setItems(items, options) { calls.push(['setItems', items, options]); }
    hide() { calls.push(['hide']); }
    unreadEvents() { return []; }
}
class Changes {
    results = [];
    async checkOnStartup() {
        this.results = [{ item: { name: '新しい公園' } }];
        return { state: 'changes', results: this.results };
    }
    tickerItems() { return this.results.map(result => ({ headline: result.item.name })); }
    previewRandom(count) {
        this.results = Array.from({ length: count }, (_, index) =>
            ({ item: { name: `【テスト】公園 ${index + 1}` } }));
        return this.results;
    }
}
const container = {};
const intro = { hidden: false };
const stub = class {};
const context = {
    console, Date,
    window: { navigator: { language: 'ja' }, localStorage: { getItem: () => null } },
    document: { getElementById: id => id === 'cMapIntro' ? intro : {} },
    IndoorControl: stub, Glottologist: stub, Basic: stub, PoiStatusCont: stub, OverPassControl: stub,
    Maplibre: class { map = { getContainer: () => container }; },
    GeoCont: stub, ListTable: stub,
    PoiCont: class { async select(...args) { calls.push(['select', ...args]); } }, PlaygroundModelFactories: {}, MapFeature3D: stub,
    GoogleSpreadSheet: stub, NewsTicker: Ticker, HistoricalNewsController: stub,
    ChangeController: Changes, AreaFeatureLinker: stub, AreaSearchController: stub,
    ListActionButtons: stub
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('cmapmaker.js', 'utf8')
    + '\nthis.fixture = { cMapMaker, changesController };', context);
context.Conf = { changes: { ticker: { use: true, maxItems: 30, mobileLabel: '公園・遊具の新着' } },
    intro: { use: true } };
(async () => {
    await context.fixture.cMapMaker.initDailyIntro();
    assert.equal(intro.hidden, true);
    assert.equal(calls[0][0], 'init');
    assert.equal(calls[0][1], container);
    assert.equal(calls[0][2].id, 'changesTicker');
    assert.equal(calls[0][2].modal, true);
    assert.equal(calls[1][0], 'setItems');
    assert.equal(calls[1][1][0].headline, '新しい公園');
    assert.equal(await calls[0][2].onSelect({ osmId: 'way/219004605', coordinates: [135.5, 34.7] }), true);
    assert.deepEqual(calls.at(-1), ['select', 'way/219004605', true, 0, [135.5, 34.7]]);
    assert.equal(await calls[0][2].onSelect({}), false);
    const mock = context.window.previewRandomChanges(3);
    assert.equal(mock.length, 3);
    assert.equal(calls.at(-1)[0], 'setItems');
    assert.equal(calls.at(-1)[1].length, 3);
    assert.equal(calls.at(-1)[1][0].headline, '【テスト】公園 1');
    context.Conf.changes.use = true;
    const maker = context.fixture.cMapMaker;
    const controller = context.fixture.changesController;
    let region = '27', refreshes = 0;
    controller.region = async () => ({code:region});
    controller.checkOnStartup = async () => { refreshes++; controller.results = [{item:{name:region === '28' ? '兵庫県の公園' : '大阪府の公園'}}]; };
    maker.displayedChangeRegion = '27';
    await maker.refreshChangeRegion();
    assert.equal(refreshes,0);
    region = '28';
    await Promise.all([maker.refreshChangeRegion(),maker.refreshChangeRegion()]);
    assert.equal(refreshes,1);
    assert.equal(maker.displayedChangeRegion,'28');
    assert.equal(calls.at(-1)[1][0].headline,'兵庫県の公園');
    console.log('PASS: startup changes and console preview reach the news ticker');
})().catch(error => { console.error(error); process.exitCode = 1; });
