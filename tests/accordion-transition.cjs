const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let shown = true, transitioning = false, nextState;
const listeners = {};
const element = {
    classList: { contains: name => name === 'show' && shown },
    addEventListener: (name, listener) => { listeners[name] = listener; }
};
const collapse = {
    show() { if (!transitioning && !shown) { transitioning = true; nextState = true; } },
    hide() { if (!transitioning && shown) { transitioning = true; nextState = false; } }
};
const finish = () => {
    assert(transitioning);
    shown = nextState;
    transitioning = false;
    listeners[shown ? 'shown.bs.collapse' : 'hidden.bs.collapse']();
};
const context = vm.createContext({ document: { getElementById: id => id === 'list' ? element : null },
    bootstrap: { Collapse: { getOrCreateInstance: () => collapse } } });
vm.runInContext(fs.readFileSync('lib/basiclib.js', 'utf8') + '\nthis.basic = new Basic();', context);
context.basic.closeAccordion('list');
context.basic.openAccordion('list');
finish();
assert.equal(shown, false);
assert.equal(transitioning, true, 'the ignored open request is replayed after hiding');
finish();
assert.equal(shown, true);
context.basic.closeAccordion('list');
context.basic.openAccordion('list');
context.basic.closeAccordion('list');
finish();
assert.equal(shown, false, 'the latest request wins');
assert.equal(transitioning, false);
assert.doesNotThrow(() => context.basic.openAccordion('missing'));
console.log('PASS: quick detail/list transitions restore the latest requested panel');
