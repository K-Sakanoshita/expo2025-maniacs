const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const translations = JSON.parse(fs.readFileSync('data/glot-system.jsonc', 'utf8'));
const context = {
    Conf: { areaFeatureLinker: { detailPlayTargets: ['Playgrounds_Play'] } },
    poiCont: { getCatnames: tags => ['', names[tags.playground || tags.amenity] || ''] },
    glot: { get: key => translations[key]?.[language] ?? key },
    window: { areaFeatureLinker: { getAreaRecord: id => ({ areaId: id, linkedFeatures: linked }) } }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('detail/osmbasic.js', 'utf8')
    + '\nthis.OSMbasic = OSMbasic;', context);

const feature = (id, tags, target) => ({ featureId: id, feature: { properties: tags }, targets: [target] });
const linked = [
    feature('node/1', { playground: 'slide' }, 'Playgrounds_Play'),
    feature('node/2', { playground: 'swing' }, 'Playgrounds_Play'),
    feature('node/3', { playground: 'slide' }, 'Playgrounds_Play'),
    feature('node/4', { amenity: 'toilets', wheelchair: 'limited', changing_table: 'yes' }, 'Playgrounds_Etc'),
    feature('node/5', { amenity: 'bench' }, 'Playgrounds_Etc'),
    feature('node/6', { amenity: 'bench' }, 'Playgrounds_Etc'),
    feature('node/6', { amenity: 'bench' }, 'Playgrounds_Etc')
];
const names = { slide: 'すべり台', swing: 'ブランコ', bench: 'ベンチ' };
let language = 'ja';
const basic = new context.OSMbasic();
const japanese = basic.makeAreaFacilities('way/1');
assert.match(japanese, /<section class="m-2"><strong>設備<\/strong>/);
assert.match(japanese, /<li>遊具<ul><li>すべり台 ×2<\/li><li>ブランコ<\/li><\/ul><\/li>/);
assert.match(japanese, /<li>トイレ<ul>/);
assert.doesNotMatch(japanese, /トイレ 1か所/);
assert.match(japanese, /車いす一部対応/);
assert.match(japanese, /おむつ交換台あり/);
assert.match(japanese, /ベンチ ×2/);
assert.match(japanese, /<ul class="mb-0">/);
assert.doesNotMatch(japanese, /詳細を見る|<button|<a /);
language = 'en';
const english = basic.makeAreaFacilities('way/1');
assert.match(english, /<strong>Facilities<\/strong>/);
assert.match(english, /<li>Play equipment<ul>/);
assert.match(english, /<li>Toilet<ul>/);
assert.match(english, /Limited wheelchair access/);
linked.push(feature('node/9', { amenity: 'toilets' }, 'Playgrounds_Etc'));
assert.match(basic.makeAreaFacilities('way/1'), /Toilets ×2/);
linked.pop();
assert.equal(basic.makeAreaFacilities('node/1'), '');
context.window.areaFeatureLinker.getAreaRecord = () => ({ areaId: 'way/1', linkedFeatures: linked });
assert.equal(basic.makeAreaFacilities('way/2'), '');
context.window.areaFeatureLinker.getAreaRecord = id => ({ areaId: id, linkedFeatures: [] });
assert.equal(basic.makeAreaFacilities('way/1'), '');
context.window.areaFeatureLinker.getAreaRecord = id => ({ areaId: id, linkedFeatures: [feature('node/8',
    { tags: { amenity: 'toilets', wheelchair: 'yes' } }, 'Playgrounds_Etc')] });
assert.match(basic.makeAreaFacilities('relation/1'), /Wheelchair accessible/);
context.window.areaFeatureLinker.getAreaRecord = id => ({ areaId: id, linkedFeatures: [feature('node/7',
    { playground: 'unsafe' }, 'Playgrounds_Play')] });
names.unsafe = '<script>';
assert.match(basic.makeAreaFacilities('way/1'), /&lt;script&gt;/);
console.log('PASS: linked play, toilet and other facilities; localized labels; no detail links');
