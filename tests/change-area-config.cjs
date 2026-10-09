const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = vm.createContext({ console, Date, URL,
    Conf: { areaFeatureLinker: { areaTargets: ['configured-area'] } },
    poiCont: { pdata: { geojson: [], targets: [] }, adata: [], get_osmid() {}, get_parent() {}, getCatnames: () => [] },
    turf: { point: coordinates => coordinates, booleanPointInPolygon: (_point, area) => area.contains !== false }
});
vm.runInContext(fs.readFileSync('lib/areafeaturelinker.js', 'utf8')
    + '\nthis.areaFeatureLinker = new AreaFeatureLinker();', context);
vm.runInContext(fs.readFileSync('lib/changecontroller.js', 'utf8')
    + '\nthis.ChangeController = ChangeController;', context);
const controller = new context.ChangeController({}, { storage: {}, fetch() {} });
controller.results = [{ kind: 'regionalCreated', target: { label: 'Feature' },
    item: { type: 'node', id: 1, lon: 135.5, lat: 34.7, name: 'Feature' } }];
function area(name, properties, target, type = 'Polygon', contains = true) {
    context.poiCont.pdata.geojson = [{ id: 'way/2', geometry: { type }, properties: { name, ...properties }, contains }];
    context.poiCont.pdata.targets = [[target]];
}
const name = () => controller.tickerItems()[0].parkName;
for (const properties of [{ leisure: 'park' }, { leisure: 'playground' }, { landuse: 'recreation_ground' },
    { amenity: 'school' }]) {
    area('Configured area', properties, 'configured-area');
    assert.equal(name(), 'Configured area', 'all configured area tags supply the containing area name');
}
area('Unconfigured park', { leisure: 'park' }, 'other');
assert.equal(name(), '', 'park tags alone must not override configured targets');
context.Conf.areaFeatureLinker.areaTargets = ['other'];
assert.equal(name(), 'Unconfigured park', 'changing the target setting changes the area match');
area('Multipolygon', { amenity: 'school' }, 'other', 'MultiPolygon');
assert.equal(name(), 'Multipolygon');
area('Outside', {}, 'other', 'Polygon', false);
assert.equal(name(), '', 'a feature outside the configured area gets no area name');
area('Point', {}, 'other', 'Point');
assert.equal(name(), '', 'point features cannot act as containing areas');
context.Conf.areaFeatureLinker.areaTargets = [];
area('Disabled', { leisure: 'park' }, 'other');
assert.equal(name(), '', 'empty area targets do not fall back to hard-coded park tags');
console.log('PASS: change ticker uses configured area targets, including playgrounds and non-park areas');
