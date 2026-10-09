const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const localStorage = {
    get length() { throw new Error('disabled'); },
    getItem() { throw new Error('disabled'); },
    setItem() { throw new Error('disabled'); }
};
const context = { localStorage, Conf: { etc: { localSave: 'playgrounds' } } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('lib/poistatuslib.js', 'utf8') + '\nthis.status = new PoiStatusCont()', context);
const status = context.status;
assert.equal(status.getRecord('way/1').favorite, false);
assert.equal(status.getAllFavorite().length, 0);
assert.doesNotThrow(() => status.setValueByOSMID('way/1', false, true, ''));
const changeContext = { window: { get localStorage() { throw new Error('denied'); } }, Date };
vm.createContext(changeContext);
vm.runInContext(fs.readFileSync('lib/changecontroller.js', 'utf8') + '\nthis.ChangeController = ChangeController', changeContext);
assert.doesNotThrow(() => new changeContext.ChangeController({ use: false }));
console.log('PASS: POI status and change controller tolerate disabled storage');
