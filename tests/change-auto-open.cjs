const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const storage = new Map();
let day = '2026-10-07', region = '27', opens = 0, moving = false, moveEnded;
const stub = class {};
class Ticker {
    init() {}
    setItems(items) { this.items = items; }
    unreadEvents() { return this.seen ? [] : this.items || []; }
    async toggle() { opens++; this.isOpen = true; }
    hide() { this.isOpen = false; }
}
class Changes {
    results = [{ name: '更新' }];
    region = async () => ({ code: region });
    localDate = () => day;
    key = suffix => `test-changes.${suffix}`;
    read = key => key === this.key('last-region') ? region : storage.get(key);
    write = (key, value) => storage.set(key, value);
    async checkOnStartup() { this.results = [{name:'更新'}]; return {state:'changes'}; }
    async checkActivityChanges() {}
    tickerItems() { return this.results; }
}
const context = {
    console, Date, Map,
    window: { navigator: { language: 'ja' }, localStorage: { getItem: () => null } },
    document: { getElementById: () => ({hidden:false}) },
    IndoorControl: stub, Glottologist: stub, Basic: stub, PoiStatusCont: stub, OverPassControl: stub,
    Maplibre: class { map = { getContainer: () => ({}), isMoving: () => moving, once: (_event, callback) => { moveEnded = callback; } }; },
    GeoCont: stub, ListTable: stub, PoiCont: stub, PlaygroundModelFactories: {}, MapFeature3D: stub,
    GoogleSpreadSheet: stub, NewsTicker: Ticker, HistoricalNewsController: stub,
    ChangeController: Changes, AreaFeatureLinker: stub, AreaSearchController: stub, ListActionButtons: stub,
    Conf: { changes: {use:true,ticker:{use:true,mobileLabel:'更新'}}, intro:{use:false} }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('cmapmaker.js','utf8') + '\nthis.fixture={cMapMaker,changeTicker,changesController};',context);
context.Conf = { changes: {use:true,ticker:{use:true,mobileLabel:"更新"}}, intro:{use:false} };
const {cMapMaker:maker,changeTicker:ticker,changesController:controller} = context.fixture;
(async () => {
    await maker.initDailyIntro();
    assert.equal(opens,1,'startup opens unseen changes');
    assert.equal(storage.get('test-changes.auto-shown.27'),day);
    ticker.hide();
    await maker.autoShowChangeModal('27');
    assert.equal(opens,1,'same prefecture/day does not reopen');
    region='28';
    await maker.refreshChangeRegion();
    assert.equal(opens,2,'new prefecture opens independently');
    ticker.hide(); region='27';
    await maker.refreshChangeRegion();
    assert.equal(opens,2,'return to Osaka does not reopen');
    maker.changeAutoShownDates = new Map();
    await maker.autoShowChangeModal('27');
    assert.equal(opens,2,'daily guard survives a reload via storage');
    day='2026-10-08';
    await Promise.all([maker.autoShowChangeModal('27'),maker.autoShowChangeModal('27')]);
    assert.equal(opens,3,'next day can open once despite overlapping calls');
    ticker.hide(); day='2026-10-09'; ticker.seen=true;
    await maker.autoShowChangeModal('27');
    assert.equal(opens,3,'already seen changes do not open');
    assert.notEqual(storage.get('test-changes.auto-shown.27'),day,'no unseen changes must not consume the day');
    ticker.seen=false; ticker.setItems([]);
    await maker.autoShowChangeModal('27');
    assert.equal(opens,3,'empty changes do not open');
    ticker.setItems([{name:'更新'}]); moving=true;
    const pending = maker.autoShowChangeModal('27');
    assert.equal(opens,3,'wait for map movement to stop');
    region='28'; moving=false; moveEnded();
    await pending;
    assert.equal(opens,3,'do not open stale prefecture after movement');
    moving=true;
    const pendingCurrent = maker.autoShowChangeModal('28');
    moving=false; moveEnded(); await pendingCurrent;
    assert.equal(opens,4,'open current prefecture after movement');
    ticker.hide(); day='2026-10-10'; context.Conf.changes.ticker.autoOpen=false;
    await maker.autoShowChangeModal('28');
    assert.equal(opens,4,'configuration can disable automatic display');
    console.log('PASS: prefecture/day auto display, seen/empty feeds, movement and overlapping calls');
})().catch(error => { console.error(error); process.exitCode=1; });
