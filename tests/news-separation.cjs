(async () => {
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
    constructor(tag) {
        this.tagName = tag;
        this.children = [];
        this.classList = { add() {}, remove() {}, toggle() {} };
        this.style = { removeProperty() {} };
        this.isConnected = false;
    }
    append(...children) { this.children.push(...children); children.forEach(child => child.isConnected = true); }
    appendChild(child) { this.append(child); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    addEventListener(type, handler) { (this.listeners ??= {})[type] = handler; }
    focus() { this.focused = true; }
    setAttribute(key, value) { this[key] = value; }
    querySelector() { return null; }
}
const container = new Element('div');
let timerCount = 0;
const viewContext = {
    bootstrap: { Modal: { getOrCreateInstance: element => ({
        show() { element.open = true; element.listeners?.["show.bs.modal"]?.(); },
        hide() { element.open = false; element.listeners?.["hidden.bs.modal"]?.(); }
    }) } },
    document: { createElement: tag => new Element(tag), body: new Element('body') },
    window: { addEventListener() {}, matchMedia: () => ({ matches: true }),
        requestAnimationFrame: callback => callback(), setInterval: () => ++timerCount,
        clearInterval() {}, setTimeout() {} }, Date, console
};
vm.createContext(viewContext);
vm.runInContext(fs.readFileSync('lib/newstickerview.js', 'utf8') + '\nthis.NewsTicker = NewsTicker', viewContext);
const ticker = new viewContext.NewsTicker();
ticker.init(container, { displayDuration: 3000 });
assert.equal(ticker.element.hidden, true);
assert.equal(ticker.element.children.length, 3); // No source link unless supplied by the feed.
ticker.setItems([{ headline: '架空の新着', date: '2026-09-29', url: 'https://example.test/item' }]);
assert.equal(ticker.element.hidden, false);
assert.equal(ticker.activeItem.tagName, 'a');
assert.equal(ticker.activeItem.href, 'https://example.test/item');
assert.equal(ticker.activeItem.children[0].children.length, 2); // Label and date; no historical year or region.
ticker.setItems([{ headline: '別の新着' }]); // A feed without a key can replace its items.
assert.equal(ticker.activeItem.tagName, 'div');
assert.equal(ticker.currentEvents[0].headline, '別の新着');
ticker.hide();
assert.equal(ticker.element.hidden, true);
const compact = new viewContext.NewsTicker();
compact.init(container, { id: 'changesTicker', collapsible: true });
compact.setItems([
    { headline: '新着の公園' },
    { headline: '新着の遊具' },
    { headline: '更新された公園' }
]);
assert.equal(compact.element.hidden, true);
assert.equal(compact.toggleButton.hidden, false);
assert.equal(compact.toggleButton.textContent, '新着 3件');
assert.equal(compact.content.children.length, 3);
assert.equal(compact.timer, null);
await compact.toggle();
assert.equal(compact.element.hidden, false);
assert.equal(compact.toggleButton['aria-expanded'], 'true');
await compact.toggle();
assert.equal(compact.element.hidden, true);
compact.hide();
assert.equal(compact.toggleButton.hidden, true);

// One entry moves between the list header and the mobile map controls.
const desktopHost = new Element('span'), mobileHost = new Element('div');
const media = { matches: true, addEventListener(type, listener) { this.listener = listener; } };
const seenValues = new Map();
viewContext.document.getElementById = id => id === 'desktopHost' ? desktopHost : mobileHost;
viewContext.window.localStorage = { getItem: key => seenValues.get(key), setItem: (key, value) => seenValues.set(key, value) };
const previousMatchMedia = viewContext.window.matchMedia;
viewContext.window.matchMedia = () => media;
const placed = new viewContext.NewsTicker();
placed.init(container, { modal: true, buttonHosts: { desktop: 'desktopHost', mobile: 'mobileHost' }, seenStorageKey: 'seen-test' });
assert.equal(desktopHost.children.at(-1), placed.toggleButton);
placed.setItems([{ headline: '公園の更新', timestamp: 1 }]);
assert.match(placed.toggleButton['aria-label'], /未確認/);
await placed.toggle();
assert.doesNotMatch(placed.toggleButton['aria-label'], /未確認/);
placed.modalInstance.hide();
media.matches = false;
media.listener();
assert.equal(mobileHost.children.at(-1), placed.toggleButton);
placed.setItems([{ headline: '公園の更新', timestamp: 2 }]);
assert.match(placed.toggleButton['aria-label'], /未確認/);
placed.setItems([]);
assert.equal(placed.toggleButton.hidden, false);
await placed.toggle();
assert.equal(placed.element.open, true);
assert.equal(placed.content.children[0].textContent, 'この地域の新着はありません');
placed.modalInstance.hide();
viewContext.window.matchMedia = previousMatchMedia;

const modal = new viewContext.NewsTicker();
modal.init(container, { id: 'changesModal', modal: true, collapsible: true });
modal.setItems([{ headline: '新しい公園' }, { headline: '更新された遊具' }]);
assert.equal(modal.element.tagName, 'div');
assert.equal(modal.element.className, 'modal changes-modal');
assert.equal(modal.content.children.length, 2);
assert.equal(modal.toggleButton.textContent, '新着 2件');
assert.equal(modal.timer, null);
await modal.toggleButton.listeners.click();
assert.equal(modal.element.open, true);
assert.equal(modal.toggleButton['aria-expanded'], 'true');
modal.element.children[0].children[0].children[0].children[1].listeners.click();
assert.equal(modal.element.open, false);
assert.equal(modal.toggleButton.focused, true);
await modal.toggle();
modal.hide();
assert.equal(modal.element.open, false);
assert.equal(modal.toggleButton.hidden, true);
modal.setItems([{ headline: '次の新着' }]);
await modal.toggle();
assert.equal(modal.element.open, true);
assert.notEqual(modal.element.hidden, true);
// Opening the modal waits for the current region's items rather than showing the old list.
modal.modalInstance.hide();
let resolveItems;
modal.config.itemsProvider = () => new Promise(resolve => { resolveItems = resolve; });
const opening = modal.toggle();
assert.equal(modal.element.open, false);
assert.equal(modal.toggleButton.disabled, true);
await modal.toggle();
assert.equal(modal.element.open, false);
resolveItems([{ name: '兵庫県の公園', region: '兵庫県', category: '口コミ', changeLabel: '口コミ更新' }]);
await opening;
assert.equal(modal.toggleButton.disabled, false);
assert.equal(modal.element.open, true);
assert.equal(modal.currentEvents[0].region, '兵庫県');
assert.equal(modal.content.children[0].children[1].textContent, '兵庫県の公園');
assert.equal(modal.currentEvents.length, 1);
delete modal.config.itemsProvider;
let selected;
modal.config.onSelect = event => { selected = event; return true; };
const change = { name: '阿弥ヨシ広場', kind: 'regionalCreated', changeLabel: '新着',
    category: '公園', date: '2026-10-05', region: '大阪府', editorName: 'osm_mapper' };
modal.setItems([change]);
const changeButton = modal.content.children[0];
assert.equal(changeButton.tagName, 'button');
assert.equal(changeButton.children[1].textContent, '阿弥ヨシ広場が地図に追加されました');
assert.equal(modal.changeHeadline({kind:'regionalCreated',name:'ブランコ',parkName:'丸山公園',region:'福井県'}), '丸山公園のブランコが地図に追加されました');
assert.equal(modal.changeHeadline({kind:'regionalCreated',name:'ブランコ',region:'福井県'}), 'ブランコが地図に追加されました');
assert.equal(modal.changeHeadline({kind:'regionalUpdated',name:'丸山公園'}), '丸山公園の地図情報が更新されました');
assert.equal(modal.changeHeadline({kind:'reviewCreated',name:'ブランコ',parkName:'十三東公園'}), '十三東公園に新しい口コミが投稿されました');
assert.equal(modal.changeHeadline({kind:'reviewUpdated',name:'馬の乗物',review:{title:'馬の乗物'}}), '公園・遊具の口コミが更新されました');
assert.equal(changeButton.children[0].children[0].textContent, '新着');
assert.equal(changeButton.children[0].children[2].textContent, '編集：osm_mapper');
assert.equal(changeButton.children[0].children[2].className, 'changes-modal__editor');
assert.equal(changeButton.href, undefined);
const duplicateReview = modal.createChangeItem({kind:'reviewUpdated',name:'十三東公園',parkName:'十三東公園',
    review:{title:'十三東公園',excerpt:'口コミ本文'}});
assert(!duplicateReview.children.some(child=>child.className==='changes-modal__review-title'));
assert(duplicateReview.children.some(child=>child.textContent==='口コミ本文'));
const distinctReview = modal.createChangeItem({kind:'reviewUpdated',name:'十三東公園',
    review:{title:'遊具が充実しています'}});
assert(distinctReview.children.some(child=>child.textContent==='遊具が充実しています'));
const fallbackReview = modal.createChangeItem({kind:'reviewUpdated',name:'馬の乗物',review:{title:'馬の乗物'}});
assert(fallbackReview.children.some(child=>child.className==='changes-modal__review-title' && child.textContent==='馬の乗物'));
const grouped = new viewContext.NewsTicker();
grouped.init(container,{modal:true});
grouped.setItems([
    {section:'other',timestamp:3,name:'その他'},
    {section:'favorite',timestamp:1,name:'古いお気に入り'},
    {section:'visited',timestamp:2,name:'訪問済み'},
    {section:'favorite',timestamp:4,name:'新しいお気に入り',thumbnail:'https://example.test/photo.jpg'}
]);
await grouped.toggle();
assert.equal(grouped.content.children.length,3);
assert.equal(grouped.content.children[0].children[0].textContent,'お気に入り（2件）');
assert.equal(grouped.content.children[0].children[1].children[1].textContent,'新しいお気に入り');
assert.equal(grouped.content.children[1].children[0].textContent,'訪問済み（1件）');
const thumbnail=grouped.content.children[0].children[1].children.find(child=>child.tagName==='img');
assert.equal(thumbnail.src,'https://example.test/photo.jpg');
thumbnail.listeners.error();assert.equal(thumbnail.hidden,true);
grouped.setItems([{section:'other',timestamp:1,name:'その他のみ'}]);
assert.equal(grouped.content.children.length,1);
assert.equal(grouped.content.children[0].children[0].textContent,'その他（1件）');
grouped.setItems([{section:'visited',timestamp:1,name:'訪問済みのみ'}]);
assert.equal(grouped.content.children.length,2);
assert.equal(grouped.content.children[0].children[0].textContent,'訪問済み（1件）');
grouped.setItems([{section:'favorite',timestamp:1,name:'お気に入りのみ'}]);
assert.equal(grouped.content.children.length,2);
assert.equal(grouped.content.children[0].children[0].textContent,'お気に入り（1件）');

await changeButton.listeners.click();
assert.equal(selected, change);
assert.equal(modal.element.open, false);
modal.config.onSelect = () => false;
await modal.toggle();
await changeButton.listeners.click();
assert.equal(modal.element.open, true);
assert.match(changeButton.children[2].textContent, /この地物を表示できません/);

const calls = [];
const feedTicker = { init: (...args) => calls.push(['init', ...args]),
    setItems: (...args) => calls.push(['setItems', ...args]), hide: () => calls.push(['hide']) };
const requests = [];
const monthly = { year: 2020, month: 9,
    regions: { 大阪府: [{ headline: '地域ニュース', date: '2020-09-01', latitude: 34.7, longitude: 135.5 }] },
    national: [{ headline: '全国ニュース', date: '2020-09-02' }] };
const fetch = async url => {
    requests.push(url);
    const data = url.endsWith('prefectures.geojson')
        ? { type: 'FeatureCollection', features: [{ properties: { 'name:ja': '大阪府' } }] }
        : url.endsWith('index.json') ? { months: ['2020-09'] } : monthly;
    return { ok: true, json: async () => data };
};
let zoom = 10;
const mapLibre = { selectStyle: 'historical', map: { getContainer: () => container,
    getCenter: () => ({ lng: 135.5, lat: 34.7 }) }, getZoom: () => zoom };
const feedContext = { NewsTicker: class {}, fetch, window: {}, console,
    turf: { point: value => value, booleanPointInPolygon: () => true } };
vm.createContext(feedContext);
vm.runInContext(fs.readFileSync('lib/newslib.js', 'utf8')
    + '\nthis.HistoricalNewsController = HistoricalNewsController', feedContext);
(async () => {
    const feed = new feedContext.HistoricalNewsController(feedTicker);
    await feed.init({ use: true, sourceBaseUrl: 'https://example.test/news',
        prefectureFile: 'https://example.test/prefectures.geojson' }, mapLibre,
    { historical: { year: 2020 } });
    assert.equal(requests.length, 3);
    const regional = calls.find(call => call[0] === 'setItems');
    assert.equal(regional[1][0].headline, '地域ニュース');
    assert.equal(regional[2].ariaLabel, 'この地域のニュース');
    zoom = 5;
    feed.update();
    const national = calls.filter(call => call[0] === 'setItems').at(-1);
    assert.equal(national[1][0].headline, '全国ニュース');
    assert.equal(national[2].ariaLabel, '全国ニュース');
    feed.init({ use: false }, mapLibre, {});
    assert.equal(calls.at(-1)[0], 'hide');
    assert.equal(requests.length, 3);
    console.log('PASS: independent news display and historical data selection');
})().catch(error => { console.error(error); process.exitCode = 1; });

})().catch(error => { console.error(error); process.exitCode = 1; });
