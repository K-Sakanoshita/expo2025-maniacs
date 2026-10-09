const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const values = new Map();
const localStorage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index]; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); }
};
const context = { localStorage, Conf: { etc: { localSave: 'playgrounds' } } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('lib/poistatuslib.js', 'utf8') + '\nthis.status = new PoiStatusCont()', context);
const status = context.status;
values.set('playgrounds.1', 'true,false,old memo');
values.set('another-map.2', 'true,true,foreign');
assert.deepEqual([...status.getValueByOSMID('1')], [true, false, 'old memo']);
assert.deepEqual(Array.from(status.getAllVisited(), ([key]) => key), ['playgrounds.1']);
assert.equal(status.getAllFavorite().length, 0);
status.setValueByOSMID('1', true, true, 'a,b "quoted"');
assert.equal(status.getRecord('1').memo, 'a,b "quoted"');
assert.deepEqual(Array.from(status.getAllFavorite(), ([key]) => key), ['playgrounds.1']);
assert.equal(values.get('another-map.2'), 'true,true,foreign');
values.set('playgrounds.1', JSON.stringify({ visited: true, favorite: true, memo: 'x', lastVisited: '2026-09-19', visitCount: 3 }));
status.setValueByOSMID('1', false, true, 'updated');
assert.equal(status.getRecord('1').visitCount, 3);
assert.equal(status.getAllVisited().length, 0);
console.log('PASS: POI status legacy data, app isolation, favorites, and future fields');
