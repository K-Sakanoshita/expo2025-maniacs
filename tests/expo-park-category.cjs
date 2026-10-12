const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const parse = file => vm.runInNewContext('(' + fs.readFileSync(file, 'utf8') + ')');
const osm = parse('data/overpass-custom.jsonc').osm;
const context = vm.createContext({ console, Conf: { osm }, poiCont: { adata: [] } });
vm.runInContext(fs.readFileSync('lib/overpasslib.js', 'utf8') + '\nthis.control = new OverPassControl();', context);
const data = JSON.parse(fs.readFileSync('data/expo2025.min.json', 'utf8'));
const forest = data.elements.find(e => e.type === 'way' && e.id === 1366073334);
const art = data.elements.find(e => e.type === 'way' && e.id === 1385379785);
const changed = context.control.setCache({ features: [forest, art].map(e => ({
    type: 'Feature', id: `${e.type}/${e.id}`, properties: { ...e.tags }
})) });
assert(changed.targets[0].includes('expo2025_restarea'), 'Forest of Tranquility belongs to the rest category');
assert(changed.targets[1].includes('expo2025_art'), 'Forest of Civilizations remains an artwork');
assert(!changed.targets[1].includes('expo2025_restarea'));
assert.equal(parse('data/category-ja.jsonc').category.leisure.park, '公園');
assert.equal(osm.expo2025_restarea.expression.poiView, true);
const exported = JSON.parse(fs.readFileSync('data/releases/2026-10-12/expo2025.geojson', 'utf8'));
assert.equal(exported.features.find(f => f.id === 'way/1366073334').properties.tags.wikimedia_commons,
    forest.tags.wikimedia_commons);
console.log('PASS: park joins rest category, artwork stays separate, park label and published photo tag are preserved');
