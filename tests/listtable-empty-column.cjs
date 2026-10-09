const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const config = vm.runInNewContext('(' + fs.readFileSync('tests/fixtures/playgrounds-listtable.jsonc', 'utf8') + ')');
const columns = config.list.views.area.columns;
const features = columns.find(column => column.id === 'features');
const distance = columns.find(column => column.id === 'distance');
assert.equal(features.preserveSpace, true);
assert(distance.className.split(/\s+/).includes('text-end'), 'distance remains right aligned');

function element() {
    return { children: [], dataset: {}, className: '',
        classList: { add() {} }, addEventListener() {},
        appendChild(child) { this.children.push(child); },
        prepend(child) { this.children.unshift(child); } };
}
const listArea = element();
const context = vm.createContext({ console, Conf: { ...config, listTable: { defaultView: 'area' } },
    window: { withAppAssetVersion: value => value },
    document: { getElementById: id => id === 'listArea' ? listArea : null,
        querySelectorAll: () => [], createElement: element },
    mapLibre: { map: { getLayer() {}, getSource() {} } },
    poiStatusCont: { getRecord: () => ({}) } });
vm.runInContext(fs.readFileSync('lib/listtable.js', 'utf8') + '\nthis.table = new ListTable();', context);
context.table.init();
context.table.makeListArea([['mock/park', 'Park', '', '50 m']]);
const row = listArea.children.at(-1).children[0].children[0];
const parts = row.children;
assert.equal(parts.length, 3, 'an empty equipment summary must keep its column between name and distance');
assert.equal(parts[1].className, features.className);
assert.equal(parts[1].children.length, 0, 'the preserved feature column is empty');
assert.equal(parts[2].className, distance.className);
assert.equal(parts[2].children[0].textContent, '50 m');
console.log('PASS: rendered empty feature column preserves space before right-aligned distance');
