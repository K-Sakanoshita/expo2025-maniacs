const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { Intl };
vm.runInNewContext(fs.readFileSync('lib/publicdatasearch.js', 'utf8') + '\nthis.Search = PublicDataSearch;', context);
const data = JSON.parse(fs.readFileSync('data/releases/2026-10-10-2/expo2025.geojson', 'utf8'));
const categories = JSON.parse(fs.readFileSync('data/category-ja.jsonc', 'utf8')).category;
const search = new context.Search(data.features, 'ja', categories);
for (const [key, value, label] of [['entrance', 'yes', '出入口'], ['natural', 'tree', '樹木'], ['amenity', 'bench', 'ベンチ'], ['man_made', 'flagpole', '旗竿']]) {
    const feature = data.features.find(feature => !feature.properties.name && feature.properties.tags[key] === value);
    assert.ok(feature);
    assert.equal(search.displayName(feature), label);
    assert.ok(search.search(label).includes(feature));
    assert.equal(feature.properties.name, '', 'display fallback must not modify published names');
}
assert.equal(search.displayName({ properties: { name: '', tags: { leisure: 'playground', playground: 'slide' } } }), 'すべり台');
assert.equal(search.displayName(data.features.find(feature => feature.properties.name === 'モンテネグロ')), 'モンテネグロ');
assert.ok(search.search('モンテネグロ').some(feature => feature.properties.name === 'モンテネグロ'));
assert.ok(search.search('ベトナム').some(feature => feature.properties.tags.country === 'VN'));
assert.ok(search.search('viet nam').some(feature => feature.properties.tags.country === 'VN'));
assert.ok(search.search('ＶＮ').some(feature => feature.properties.tags.country === 'VN'));
assert.equal(search.search().length, data.features.length);
assert.ok(search.search().some(feature => feature.properties.tags.natural === 'tree'));
assert.ok(search.search('ローソン').some(feature => feature.properties.tags.shop === 'convenience'));
assert.equal(search.search('存在しない検索語').length, 0);
assert.deepEqual(Array.from(search.countryNames({ country: ' JP;EU; ASEAN; XXINVALID ' })), ['日本', '欧州連合', '東南アジア諸国連合', 'XXINVALID']);
const alternate = new context.Search([
    { properties: { name: '北欧館', tags: { amenity: 'exhibition_centre', country: 'SE;FI', alt_name: 'Nordic Pavilion' } } },
    { properties: { name: '旗', tags: { country: 'FI', man_made: 'flagpole' } } }
]);
assert.equal(alternate.search('フィンランド').length, 2, 'country matches must include non-pavilion features');
assert.equal(alternate.search('NORDIC').length, 1);
assert.doesNotMatch(fs.readFileSync('data.html', 'utf8'), /demo-category/);
console.log('PASS: all features searchable, country names/codes, multilingual search, missing results and multi-country handling');
