const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const values = new Map();
let listClick;
const listArea = { addEventListener: (type, listener) => { if (type === 'click') listClick = listener; },
    contains: () => true };
const status = { visited: true, favorite: false, memo: 'keep' };
const context = { Conf: { etc: { localSave: 'playgrounds' } }, Date,
    document: { getElementById: () => listArea },
    poiStatusCont: { getRecord: () => status,
        setValueByOSMID: (_id, visited, favorite, memo) => {
            status.visited = visited; status.favorite = favorite; status.memo = memo;
        } },
    cMapMaker: { viewPoi: () => {} }, list_category: { value: '-' },
    localStorage: { getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value) } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('lib/listtable.js', 'utf8') + '\nthis.ListTable = ListTable', context);
const list = new context.ListTable();
let renders = 0;
list.renderList = () => renders++;
list.setDisplayMode('recent');
assert.equal(list.displayMode, 'recent');
list.recordView('way/1');
list.recordView('way/2');
list.recordView('way/1');
assert.deepEqual(Array.from(list.getRecent(), x => x.id), ['way/1', 'way/2']);
for (let i = 0; i < 35; i++) list.recordView(`node/${i}`);
assert.equal(list.getRecent().length, 30);
assert.equal(list.getRecent()[0].id, 'node/34');
assert(renders >= 3);
list.init();
let selected = 0;
list.select = () => selected++;
list.renderList = () => renders++;
const item = { dataset: { id: 'way/1' } };
let prevented = false;
let stopped = false;
for (const [kind, expected] of [['favorite', true], ['visited', false]]) {
    const button = { closest: selector => selector === '.list-group-item' ? item : null,
        classList: { contains: name => name === `list-${kind}` } };
    listClick({ target: { closest: selector => selector === '.list-status-button' ? button : item },
        preventDefault: () => prevented = true, stopPropagation: () => stopped = true });
    assert.equal(status[kind], expected);
}
assert.equal(status.memo, 'keep');
assert.equal(selected, 0);
assert(prevented && stopped);
console.log('PASS: recent history order, deduplication, limit, and active mode refresh');

context.Conf.etc.localSave = '';
const savedBefore = JSON.stringify([...values]);
list.recordView('node/disabled', 'Should not persist');
assert.equal(JSON.stringify([...values]), savedBefore);
assert.equal(list.getRecent().length, 0);
console.log('PASS: disabled localSave does not read or write recent history');
