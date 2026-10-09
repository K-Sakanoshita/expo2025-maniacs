const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const stub = class {};
const copied = [], messages = [], prompts = [];
let reject = false;
const context = vm.createContext({ console, Date, URL,
    location: { origin: 'https://armd-02.github.io', pathname: '/Playgrounds/',
        search: '?node/123', hash: '#19/34.7/135.5' },
    window: { navigator: { language: 'ja' }, prompt: (...args) => prompts.push(args) },
    navigator: { clipboard: { writeText: async url => { if (reject) throw new Error('denied'); copied.push(url); } } },
    IndoorControl: stub, Glottologist: class { get(key) { return key; } },
    Basic: stub, PoiStatusCont: stub, OverPassControl: stub,
    Maplibre: stub, GeoCont: stub, ListTable: stub, PoiCont: stub,
    PlaygroundModelFactories: {}, MapFeature3D: stub, GoogleSpreadSheet: stub,
    NewsTicker: stub, HistoricalNewsController: stub, ChangeController: stub,
    AreaFeatureLinker: stub, AreaSearchController: stub, ListActionButtons: stub,
    winCont: { showMessage(text) { messages.push(text); } }
});
vm.runInContext(fs.readFileSync('cmapmaker.js', 'utf8') + '\nthis.maker = cMapMaker;', context);
context.Conf = { etc: { publicUrl: 'https://playgrounds.openacrossbase.net/' } };
(async () => {
    assert.equal(await context.maker.shareURL(), true);
    assert.equal(copied.at(-1), 'https://playgrounds.openacrossbase.net/?node/123#19/34.7/135.5');
    assert.deepEqual(messages, ['share_url_copied']);
    assert.equal(await context.maker.shareURL('Playgrounds/7'), true);
    assert.equal(copied.at(-1), 'https://playgrounds.openacrossbase.net/?node/123.Playgrounds/7#19/34.7/135.5');
    reject = true;
    assert.equal(await context.maker.shareURL(), false);
    assert.deepEqual(prompts.at(-1), ['share_url_copy_failed', copied[0]]);
    assert.equal(messages.length, 2, 'failed copy must not announce success');
    delete context.navigator.clipboard;
    assert.equal(await context.maker.shareURL(), false);
    assert.equal(prompts.length, 2, 'unsupported clipboard offers manual copy too');
    context.Conf.etc.publicUrl = '';
    assert.equal(await context.maker.shareURL(), false);
    assert.equal(prompts.at(-1)[1], 'https://armd-02.github.io/Playgrounds/?node/123#19/34.7/135.5');
    console.log('PASS: canonical share URLs retain map/item state; success, rejection and missing clipboard provide correct feedback');
})().catch(error => { console.error(error); process.exitCode = 1; });
