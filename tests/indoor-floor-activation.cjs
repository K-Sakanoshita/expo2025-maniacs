const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let intersects = 0;
let zoom = 17;
const context = vm.createContext({
    Conf: {
        etc: { editMode: false },
        poiView: { poiZoom: { amenity: 16, indoor: 18 }, editZoom: {} },
        osm: { amenity: { expression: { poiView: true } }, indoor: { expression: {
            poiView: false, renderTags: { line: { indoor: ['room', 'corridor'] } }
        } } },
        indoor: { floorHeightMeters: 3.66, fallbackLevels: { 'highway=corridor': '0' } }
    },
    basic: { isSmartPhone: () => false },
    window: { matchMedia: () => ({ matches: false }) },
    poiCont: { getTargets: () => ['amenity', 'indoor'], isPoiViewVisible: targets => targets.includes('amenity') },
    mapLibre: { getZoom: () => zoom, map: {
        getBounds: () => ({ getWest: () => 0, getSouth: () => 0, getEast: () => 10, getNorth: () => 10 }),
        getContainer: () => ({ clientHeight: 900 }), unproject: () => ({ lat: 9 })
    } },
    turf: { booleanIntersects: () => { intersects++; return true; } }
});
vm.runInContext(fs.readFileSync('lib/indoorlib.js', 'utf8') + '\nthis.control = new IndoorControl();', context);
context.control.getPoiZoom = target => context.Conf.poiView.poiZoom[target];
const point = (id, tags) => ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [5, 5] }, properties: tags });
const building = { type: 'Feature', id: 'building', geometry: { type: 'Polygon', coordinates: [[[0,0],[10,0],[10,10],[0,10],[0,0]]] }, properties: { building: 'yes', 'building:levels': '4' } };
const outdoor = Array.from({ length: 2000 }, (_, i) => point('node/' + i, { amenity: 'bench' }));
const targets = outdoor.map(() => ['amenity']);
const result = (...args) => context.control.getLevelFeatureControlContext(...args);
assert.equal(result([...outdoor, building], [...targets, []]), null);
assert.equal(intersects, 0, 'outdoor POIs must not initiate building intersection work');
assert.deepEqual(Array.from(context.control.getIndoorPoiLevels(outdoor[0])), ['0'], 'unassigned POIs still display on 1F after activation');
context.control.levelModeActive = true;
context.control.indoorLevel = '0';
assert.equal(context.control.isPoiVisibleInLevelMode({ geojson: outdoor[0] }), true);
context.control.indoorLevel = '1';
assert.equal(context.control.isPoiVisibleInLevelMode({ geojson: outdoor[0] }), false);

const explicit = point('explicit', { amenity: 'library', level: '1' });
const activated = result([explicit, ...outdoor, building], [['amenity'], ...targets, []]);
assert.deepEqual(Array.from(activated.availableLevels), ['0', '1'], 'unassigned POIs make 1F selectable after explicit-floor activation');
assert.equal(intersects, 1, 'only the explicitly assigned POI is intersected with the building');
assert(activated.levels.includes('3'), 'building height extends selectable levels');
const clinic = point('clinic', { amenity: 'doctors', level: '8' });
const mixedFloors = result([clinic, ...outdoor], [['amenity'], ...targets]);
assert.deepEqual(Array.from(mixedFloors.availableLevels), ['0', '8'], '9F clinic must not hide the fallback floor of other visible facilities');
assert.equal(intersects, 1, 'fallback-floor availability introduces no building intersection work');
context.control.indoorLevel = '0';
assert.equal(context.control.isPoiVisibleInLevelMode({ geojson: outdoor[0] }), true);
assert.equal(context.control.isPoiVisibleInLevelMode({ geojson: clinic }), false);
assert.equal(result([point('ground', { amenity: 'library', level: '0' })], [['amenity']]).levelFeatureMode, true);
assert.deepEqual(Array.from(result([point('roof', { amenity: 'cafe', location: 'roof' })], [['amenity']]).availableLevels), ['roof']);
assert.deepEqual(Array.from(result([point('repeat', { amenity: 'bench', repeat_on: '1;2' })], [['amenity']]).availableLevels), ['1', '2']);
const beforeSkippedBuildings = intersects;
const lowBuildings = Array.from({ length: 500 }, (_, i) => ({ ...building, id: 'low/' + i }));
const upperFloor = point('upper', { amenity: 'library', level: '8' });
assert.deepEqual(Array.from(result([upperFloor, ...lowBuildings], [['amenity']]).levels), ['8']);
assert.equal(intersects, beforeSkippedBuildings, 'buildings below known floors need no geometry intersections');
const unknownHeight = { ...building, properties: { building: 'yes' } };
result([explicit, unknownHeight], [['amenity']]);
assert.equal(intersects, beforeSkippedBuildings, 'buildings without a usable height cannot extend the range');
const groundBuilding = { ...building, properties: { building: 'yes', 'building:levels': '1' } };
assert.deepEqual(Array.from(result([point('roof-only', { amenity: 'cafe', location: 'roof' }), groundBuilding], [['amenity']]).levels), ['0', 'roof']);
assert.equal(intersects, beforeSkippedBuildings + 1, 'roof-only features still infer a numeric floor from a building');
zoom = 15;
assert.equal(result([explicit], [['amenity']]), null, 'existing zoom threshold is preserved');
console.log('PASS: outdoor POIs do not activate floor mode or trigger intersections; explicit floors, roof, repeated floors and 1F fallback remain supported');
