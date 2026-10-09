const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const listArea = { addEventListener() {}, contains() { return true; } };
const context = vm.createContext({
    console,
    Conf: {
        areaFeatureLinker: { mapMode: 'allVisibleFeatures', parentMarkerBelowZoomTargets: [] },
        listTable: { category: 'tags', defaultView: 'area', viewBindings: { default: 'area' }, allActs: false, target: '' },
        list: {
            columns: { poiFields: ['id', '#category', '#name', '#title'], actFields: ['id'] },
            views: { area: { source: 'areaFeatureLinker' } }
        },
        osm: {
            Playgrounds_Park: { expression: { poiView: true } },
            Playgrounds_Etc: { expression: { poiView: true } }
        }
    },
    document: { getElementById: () => listArea },
    window: {
        areaFeatureLinker: {
            isAreaId: id => id === 'way/park',
            resolveAreaId: id => id === 'node/linked' ? 'way/park' : id
        }
    },
    list_category: { value: '-' },
    poiCont: {
        getTargets: () => ['Playgrounds_Park', 'Playgrounds_Etc'],
        get_osmid: id => id === 'node/vending' ? {
            geojson: { properties: { amenity: 'vending_machine' } },
            targets: ['Playgrounds_Etc']
        } : undefined,
        get_actid: () => undefined,
        getCatnames: properties => ['', '', properties.amenity === 'vending_machine' ? 'amenity=vending_machine' : '', ''],
        makeList: () => [
            ['way/park', '公園', '公園', '', 'leisure=park', ['Playgrounds_Park'], 'park.png'],
            ['node/linked', 'ベンチ', '', '', 'amenity=bench', ['Playgrounds_Etc'], 'bench.png'],
            ['node/vending', '自動販売機', '', '', 'amenity=vending_machine', ['Playgrounds_Etc'], 'vending.png']
        ]
    },
    mapLibre: { getZoom: () => 19.8 },
    cMapMaker: { getPoiZoom: () => 17 }
});

vm.runInContext(fs.readFileSync(path.join(__dirname, '../lib/listtable.js'), 'utf8') + '\nthis.ListTable = ListTable;', context);
const table = new context.ListTable();
table.init();
assert.deepEqual(JSON.parse(JSON.stringify(table.getMarkerList())), [['node/vending']]);

context.list_category.value = 'tags,amenity.vending_machine';
assert.deepEqual(JSON.parse(JSON.stringify(table.getMarkerList())), [['node/vending']]);

table.setAreaFilter(true);
assert.deepEqual(JSON.parse(JSON.stringify(table.getMarkerList())), []);

console.log('PASS: area list and all-visible map markers are independent');
