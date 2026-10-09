const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
const get = id => {
    if (!elements.has(id)) elements.set(id, {hidden: false, addEventListener() {}});
    return elements.get(id);
};
let localized = 0, refreshed = 0, closed = 0;
const context = vm.createContext({
    Conf: {areaSearch: {use: false}, etc: {localSave: 'expo2025'}},
    document: {getElementById: get, querySelectorAll: () => [], querySelector: () => ({value: 'visited'})},
    bootstrap: {Modal: {getOrCreateInstance: () => ({show() {}, hide() {closed++;}})}},
    mapLibre: {getZoom: () => 18},
    cMapMaker: {
        mode: 'map',
        refreshLocalFilters() {refreshed++;},
        changeMode(mode) {this.mode = mode;}
    },
});
vm.runInContext(fs.readFileSync('lib/areasearchcontroller.js', 'utf8') + '\nthis.Controller = AreaSearchController;', context);
const controller = new context.Controller({records: [], configuredTargets: () => [], rebuildIndex: () => []});
controller.localizeUi = () => {localized++;};
controller.setForm = () => {};
controller.init();
assert.equal(localized, 1, 'shared list controls must be localized even with area search disabled');
controller.open();
assert.equal(get('poiFilterSearchContent').hidden, true, 'dedicated search remains disabled');
assert.equal(get('poiFilterActions').hidden, false, 'personal filters must have an Apply button');
controller.draftCriteria = () => ({});
controller.apply = () => assert.fail('personal filters must not activate area matching or remote search');
controller.applyFromForm();
assert.equal(context.cMapMaker.visitedFilterStatus, 'visited');
assert.equal(refreshed, 1);
assert.equal(closed, 1);
assert.equal(context.cMapMaker.mode, 'list', 'applying personal filters returns to their list results');
context.Conf.etc.localSave = '';
controller.open();
assert.equal(get('poiFilterActions').hidden, true, 'without either feature, actions stay hidden');
console.log('PASS: disabled area search retains localized shared UI and functional personal filters');
