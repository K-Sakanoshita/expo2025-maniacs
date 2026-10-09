const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let tick, fade, cleared = false, removed = false;
const opacityValues = [];
const map = {
    getLayer: () => removed ? undefined : { type: 'fill' },
    getSource: () => ({}),
    setPaintProperty: (id, property, value) => opacityValues.push(value),
    removeLayer: () => { removed = true; }, removeSource() {}
};
const context = { mapLibre: { map }, setTimeout: callback => { fade = callback; return 1; },
    clearTimeout() {}, setInterval: callback => { tick = callback; return 2; },
    clearInterval: () => { cleared = true; } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('lib/geolib.js', 'utf8') + '\nthis.geoCont = new GeoCont();', context);
context.geoCont.writePolygon = () => {};
context.geoCont.flashPolygon({});
fade();
for (let i = 0; i < 40 && !cleared; i++) tick();
assert.equal(cleared, true);
assert.equal(removed, true);
assert.equal(opacityValues.length, 7);
assert.equal(opacityValues.at(-1), 0);
assert.equal(opacityValues.filter(value => value === 0).length, 1);
console.log('PASS: fade stops at zero opacity and removes temporary geometry');
