const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = { hidden: true }, targets = { children: [], replaceChildren(...children) { this.children = children; } };
let zoomReads = 0;
const context = vm.createContext({
    Conf: { mapDisplayStatus: { use: false },
        poiView: { poiZoom: { pavilion: 16 } }, osm: { pavilion: { expression: { poiView: true } } } },
    document: {
        getElementById: id => id === 'mapDisplayStatus' ? root : id === 'mapDisplayTargets' ? targets : null,
        createElement: () => ({ dataset: {}, setAttribute() {} })
    },
    mapLibre: { getZoom: () => { zoomReads++; return 17; } }
});
vm.runInContext(fs.readFileSync('lib/areasearchcontroller.js', 'utf8')
    + '\nthis.controller = new AreaSearchController({});', context);
context.controller.renderDisplayStatus();
assert.equal(root.hidden, true);
assert.equal(zoomReads, 0, 'disabled indicators must not render map status');
context.Conf.mapDisplayStatus.use = true;
context.controller.renderDisplayStatus();
assert.equal(root.hidden, false);
assert.equal(targets.children.length, 1);
assert.equal(targets.children[0].dataset.visible, 'true');
delete context.Conf.mapDisplayStatus;
context.controller.renderDisplayStatus();
assert.equal(root.hidden, false, 'existing configurations keep the indicator enabled');
context.Conf.mapDisplayStatus = { use: false };
context.controller.renderDisplayStatus();
assert.equal(root.hidden, true, 'switching off hides a previously rendered indicator');
console.log('PASS: map indicator supports Off, On, legacy defaults, and repeated toggling');
