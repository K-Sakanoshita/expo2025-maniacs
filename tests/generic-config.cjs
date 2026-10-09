const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const parse = name => vm.runInNewContext('(' + fs.readFileSync(name, 'utf8') + ')');
const Stub = class {};
const context = vm.createContext({
    window: { navigator: { language: 'ja' } },
    IndoorControl: Stub, Glottologist: Stub, Basic: Stub, PoiStatusCont: Stub,
    OverPassControl: Stub, Maplibre: Stub, GeoCont: Stub, ListTable: Stub,
    PoiCont: Stub, MapFeature3D: Stub, PlaygroundModelFactories: {},
    GoogleSpreadSheet: Stub, HistoricalNewsController: Stub, NewsTicker: Stub,
    ChangeController: Stub, AreaFeatureLinker: Stub, AreaSearchController: Stub,
    ListActionButtons: Stub
});
vm.runInContext(fs.readFileSync('cmapmaker.js', 'utf8') + '\nthis.maker = cMapMaker;', context);
const config = parse('data/config-user.jsonc');
const before = JSON.stringify(config);
context.Conf = structuredClone(config);
context.maker.prepareConfig();
const prepared = context.Conf;
assert.equal(JSON.stringify(config), before);
for (const key of Object.keys(config)) {
    assert.equal(JSON.stringify(prepared[key]), JSON.stringify(config[key]), `${key} is preserved`);
}
assert.equal(prepared.activity.url, config.google.AppScript);
assert.equal(prepared.activity.targetName, config.google.targetName);
assert.equal(prepared.activity.authMode, 'legacy');
for (const name of ['news', 'changes', 'intro', 'areaFeatureLinker', 'areaSearch',
    'discovery', 'listActions', 'feature3d', 'directions']) {
    assert.equal(prepared[name].use, false, `${name} requires opt-in`);
}
assert.equal(prepared.indoor.use, false);
assert.equal(parse('data/glot-custom.jsonc').site_title.ja, 'EXPO2025 万博マニアックマップ');
assert.equal(parse('manifest.json').gId, 'G-T912TLST3W');
assert.equal(prepared.map.tileName, 'EXPO2025_LASTDAY');
assert.equal(JSON.stringify(prepared.map.viewCenter), '[135.38360336,34.64993865]');
assert.equal(prepared.minimap.use, true);
assert.equal(prepared.static.use, true);
assert.equal(JSON.stringify(prepared.static.osmjsons), '["./data/expo2025.min.json"]');
assert.equal(prepared.etc.localSave, 'expo2025');
assert.equal(prepared.etc.reverseIcon, true);
assert.equal(prepared.selectItem.default, 'expo2025_exp');
assert.equal(prepared.icon.markerColors.attention.stroke, '#ffc786');
assert.equal(JSON.stringify(parse('data/listtable.jsonc').list.columns.poiFields),
    '["id","ref","name","reservation"]');
assert.equal(prepared.menu.modal.find(item => item['glot-model'] === 'osm_open').linkto,
    'javascript:winCont.osm_open(cMapMaker.openOSMid)');

// Explicit new settings take precedence over the legacy adapter and defaults.
context.Conf = structuredClone(config);
context.Conf.google.AppScript = 'https://script.google.com/macros/s/example/exec';
context.maker.prepareConfig();
assert.equal(context.Conf.activity.url, context.Conf.google.AppScript);
context.Conf.activity = { url: 'https://example.test/activities', authMode: 'basic', targetName: 'custom' };
context.Conf.areaFeatureLinker = { use: true, areaTargets: ['historic'] };
context.Conf.feature3d = { use: true, models: {}, rules: [] };
context.maker.prepareConfig();
assert.equal(context.Conf.activity.url, 'https://example.test/activities');
assert.equal(context.Conf.activity.authMode, 'basic');
assert.equal(context.Conf.activity.targetName, 'custom');
assert.equal(context.Conf.areaFeatureLinker.use, true);
assert.equal(context.Conf.feature3d.use, true);
console.log('PASS: Expo archive settings, legacy GAS compatibility, disabled dedicated services, and explicit opt-in');
