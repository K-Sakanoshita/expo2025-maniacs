const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const parse = file => vm.runInNewContext('(' + fs.readFileSync(file, 'utf8') + ')');
const osm = parse('data/overpass-custom.jsonc').osm;
const ctx = vm.createContext({ console, Conf: { osm }, poiCont: { adata: [] } });
vm.runInContext(fs.readFileSync('lib/overpasslib.js', 'utf8') + '\nthis.control = new OverPassControl();', ctx);
const tags = osm.expo2025_service.tags;
for (const nameKey of ['name', 'name:en', 'name:ja']) {
    assert(ctx.control.isTagsInclude({ natural: 'water', [nameKey]: 'Water Plaza' }, tags));
    assert(!ctx.control.isTagsInclude({ natural: 'water', [nameKey]: '  ' }, tags));
}
assert(!ctx.control.isTagsInclude({ natural: 'water' }, tags));
assert(!ctx.control.isTagsInclude({ name: 'Other facility' }, tags));
assert(!ctx.control.isTagsInclude({ natural: 'wood', name: 'Forest' }, tags));
for (const amenity of ['events_venue', 'theatre', 'exhibition_centre']) {
    assert(ctx.control.isTagsInclude({ amenity }, osm.expo2025_exp.tags));
}
const data = JSON.parse(fs.readFileSync('data/expo2025.min.json'));
const waters = data.elements.filter(e => e.tags?.natural === 'water');
const features = waters.map(e => ({ type: 'Feature', id: `${e.type}/${e.id}`, properties: { ...e.tags } }));
ctx.control.setCache({ features });
for (const feature of features) {
    assert(!ctx.control.isTagsInclude(feature.properties, osm.expo2025_exp.tags), 'Water is excluded from the exhibition category');
}
const cached = ctx.control.Cache;
const hasExpoTarget = id => {
    const i = cached.geojson.findIndex(f => f.id === id);
    return i !== -1 && cached.targets[i].includes('expo2025_service');
};
assert(hasExpoTarget('way/1377763365'), 'Water Plaza is a service POI');
assert(hasExpoTarget('way/1377763364'), 'Sea of Connections is a service POI');
for (const e of waters.filter(e => !['name', 'name:en', 'name:ja'].some(k => String(e.tags[k] ?? '').trim()))) {
    assert(!hasExpoTarget(`${e.type}/${e.id}`), `Unnamed water must be excluded: ${e.id}`);
}
assert.equal(osm.expo2025_service.expression.poiView, true);
console.log('PASS: named water joins expo2025_service, unnamed water excluded, existing exhibition tags preserved');
console.log('Named water:', waters.filter(e => hasExpoTarget(`${e.type}/${e.id}`)).map(e => `${e.type}/${e.id} ${e.tags.name ?? e.tags['name:en'] ?? e.tags['name:ja']}`).join(', '));
