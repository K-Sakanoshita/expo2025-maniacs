const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const rows = [
    ['node/1', 'P1', 'Pavilion', '', 'tourism=attraction', ['expo2025_exp'], 'museum.png'],
    ['node/3', 'P3', 'Other pavilion', '', 'tourism=attraction', ['expo2025_exp'], 'museum.png'],
    ['node/2', '', 'Toilets', '', 'amenity=toilets', ['expo2025_restarea'], 'toilet.png']
];
const context = vm.createContext({console,
    Conf: {
        listTable: {category: 'menu', target: 'targets', allActs: true},
        list: {columns: {poiFields: ['id','ref','name','reservation'],actFields: ['id'],style: []}},
        osm: {expo2025_exp: {expression: {poiView: true}},expo2025_restarea: {expression: {poiView: true}}}
    },
    document: {getElementById: () => ({addEventListener() {}})},
    list_category: {value: 'expo2025_exp'},
    list_keyword: {value: 'Pavilion'},
    poiCont: {getTargets: () => ['expo2025_exp','expo2025_restarea'],makeList: () => rows,
        get_osmid: () => ({geojson: {properties: {}}})},
    poiStatusCont: {getRecord: id => ({visited: id === 'node/1'})}
});
vm.runInContext(fs.readFileSync('lib/listtable.js','utf8')+'\nthis.table = new ListTable();',context);
context.table.init();
context.table.makeList(false);
assert.equal(context.table.getFilterList().length,2);
assert.equal(context.table.getFilterList()[0][0],'node/1');
context.table.filterByPoiStatus('visited',false,false);
assert.equal(context.table.getFilterList().length,1);
context.list_keyword.value='Other';
context.table.makeList(false);
assert.equal(context.table.getFilterList().length,1);
assert.equal(context.table.getFilterList()[0][0],'node/3');
context.list_category.value='expo2025_restarea';
context.list_keyword.value='';
context.table.makeList(false);
assert.equal(context.table.getFilterList()[0][0],'node/2');
context.table.filterByPoiStatus('visited',false,false);
assert.equal(context.table.getFilterList().length,0);
console.log('PASS: manual Expo categories use target membership and preserve visit filtering');
