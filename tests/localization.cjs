const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = path => fs.readFileSync(path, 'utf8');
const dictionaries = Object.assign({},
    vm.runInNewContext('(' + read('data/glot-system.jsonc') + ')'),
    vm.runInNewContext('(' + read('data/glot-custom.jsonc') + ')'));
for (const lang of ['en-US', 'ja-JP', 'fr-FR']) {
    const expected = lang.startsWith('ja') ? 'ja' : 'en';
    const message = {}, retry = {}, image = { src: "./image/cMapmaker.png?ver=20260823-54" };
    const context = { window: { navigator: { language: lang } }, document: {
        documentElement: {}, getElementById: id => id === 'startupRetry' ? retry : message,
        querySelector: () => image
    } };
    vm.createContext(context);
    vm.runInContext(read('lib/startuplocalization.js'), context);
    context.window.initStartupLocalization();
    assert.equal(context.window.APP_LANGUAGE, expected);
    assert.equal(context.document.documentElement.lang, expected);
    assert.equal(retry.textContent, expected === 'ja' ? '再読み込み' : 'Reload');
    assert.equal(message.textContent, expected === 'ja' ? 'アプリを読み込んでいます…' : 'Loading the app…');
    if (expected === 'en') {
        assert.equal(context.document.title, 'Community Map Maker');
        for (const key of ['app', 'files', 'libraries', 'settings', 'config', 'failed', 'mapFailed', 'configFailed'])
            assert.doesNotMatch(context.window.startupText(key), /[ぁ-んァ-ヶ一-龯]/);
    }
    assert.equal(image.src, "./image/cMapmaker.png?ver=20260823-54");
}
const glot = { lang: 'en', get(key) { return dictionaries[key]?.[this.lang] || null; } };
const context = { glot, window: { localStorage: { getItem: () => null } } };
vm.createContext(context);
vm.runInContext(read('lib/newstickerview.js') + '\nthis.NewsTicker = NewsTicker;', context);
vm.runInContext(read('lib/changecontroller.js') + '\nthis.ChangeController = ChangeController;', context);
const ticker = new context.NewsTicker();
assert.equal(ticker.changeHeadline({ kind: 'reviewCreated' }), 'A new review was posted for Map feature');
assert.equal(ticker.changeHeadline({ kind: 'reviewUpdated', name: '公園・遊具の口コミ' }),
    'A review for Map features was updated');
assert.equal(ticker.changeHeadline({ kind: 'regionalCreated', parkName: 'Central Park', name: 'Slide' }),
    'Slide in Central Park was added to the map');
assert.equal(ticker.label('newCount', '', { count: 3 }), '3 new updates');
assert.equal(ticker.formatDate('2026-10-05'), 'Oct 5');
assert.equal(ticker.formatDate('2026-10'), 'Oct');
const config = vm.runInNewContext('(' + read('tests/fixtures/playgrounds-config-user.jsonc') + ')').changes;
const controller = new context.ChangeController(config);
controller.results = [{ kind: 'reviewUpdated', target: { label: '口コミ' },
    item: { osmid: 'node/1', activityId: 'test/1', name: '公園・遊具の口コミ', updated_at: '2026-10-05T00:00:00Z' } }];
const event = controller.tickerItems()[0];
assert.equal(event.name, 'Feature reviews');
assert.equal(event.category, 'Reviews');
assert.equal(event.changeLabel, 'Review updated');
assert.doesNotMatch(event.headline, /[ぁ-んァ-ヶ一-龯]/);
assert.equal(controller.targetLabel(config.targets.find(target => target.id === 'park')), 'Park');
assert.equal(controller.changeLabel('regionalCreated'), 'Added to the map');
assert.doesNotMatch(ticker.changeHeadline(event), /[ぁ-んァ-ヶ一-龯]/);
// User-supplied names/reviews are preserved, even when they are Japanese.
assert.match(ticker.changeHeadline({ kind: 'reviewCreated', name: '日本の公園' }), /日本の公園/);
const source = read('lib/newstickerview.js');
for (const match of source.matchAll(/this\.label\("([^"]+)"/g)) {
    assert.ok(dictionaries[`changeFeed_${match[1]}`]?.en, `English label missing: ${match[1]}`);
}
glot.lang = 'ja';
assert.equal(ticker.changeHeadline({ kind: 'reviewCreated', name: '公園・遊具の口コミ' }), '施設に新しい口コミが投稿されました');
assert.equal(ticker.formatDate('2026-10-05'), '10月5日');
assert.equal(controller.targetLabel(config.targets.find(target => target.id === 'park')), '公園');
console.log('PASS: startup language, English fallback, review/map updates, dates, config labels, and Japanese preservation');
