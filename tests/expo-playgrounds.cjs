const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const osm = require('../lib/osmtogeojson.js');
const parse = file => vm.runInNewContext('(' + fs.readFileSync(file, 'utf8') + ')');
const config = parse('data/config-user.jsonc');
const targets = parse('data/overpass-custom.jsonc');
const ctx = vm.createContext({ console, Conf: targets, poiCont: { adata: [] } });
for (const file of ['lib/overpasslib.js', 'lib/playgroundmodels3d.js', 'lib/mapfeature3d.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
}
vm.runInContext('this.cache = new OverPassControl(); this.models = new MapFeature3D({modelFactories: PlaygroundModelFactories});', ctx);
ctx.models.configure(config.feature3d);
const raw = JSON.parse(fs.readFileSync('data/expo2025.json'));
assert.deepEqual(JSON.parse(fs.readFileSync('data/expo2025.min.json')), raw);
const features = osm(raw, { flatProperties: true });
ctx.cache.setCache(features);
const ids = ['12769696408', '12769696409', '12769696411', '12769696412', '12769696413', '12769696414', '12778226733', '12809077368', '12827740365'];
for (const id of ids) {
    const i = ctx.cache.Cache.geojson.findIndex(f => f.id === 'node/' + id);
    assert(i >= 0);
    const feature = ctx.cache.Cache.geojson[i];
    for (const target of ['expo2025_service', 'expo2025_art']) {
        assert(ctx.cache.Cache.targets[i].includes(target));
        assert.equal(config.poiView.poiZoom[target], 16);
    }
    assert(ctx.models.getModelKey(feature.properties), 'model for ' + id);
    if (feature.properties['playground:theme'] === 'komyaku') {
        assert.equal(ctx.models.getModelKey(feature.properties), 'play_komyaku_eye');
    }
}
assert.equal(ctx.models.getModelKey({ playground: 'cushion' }), 'play_cushion');
assert.equal(ctx.models.getModelKey({ id: 'way/1379324925', amenity: 'shelter', playground: 'structure' }), undefined);
const known = new Set(ids.map(id => 'node/' + id));
for (const feature of features.features.filter(f => f.properties.playground && !known.has(f.id))) {
    for (const target of ['expo2025_service', 'expo2025_art']) {
        assert.equal(ctx.cache.isTagsInclude(feature.properties, targets.osm[target].tags), false);
    }
}
console.log('PASS: nine playgrounds have 3D models and both target categories; existing shelter and slide areas are unaffected');
