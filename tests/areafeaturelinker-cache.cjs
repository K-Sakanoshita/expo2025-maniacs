const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const area = id => ({ id, properties: { id, leisure: 'park', name: id } });
const features = [area('way/1')];
const targets = [['Playgrounds_Park']];
const poiById = id => {
    const index = features.findIndex(feature => feature.id === id);
    return index < 0 ? undefined : { geojson: features[index], targets: targets[index], lnglat: [135, 35] };
};
const context = vm.createContext({
    console,
    Conf: {
        areaFeatureLinker: {
            use: true,
            areaTargets: ['Playgrounds_Park'],
            featureTargets: ['Playgrounds_Play']
        }
    },
    glot: { lang: 'ja' },
    poiCont: {
        revision: 1,
        pois: () => ({ pois: { geojson: features, targets }, acts: [] }),
        get_osmid: poiById,
        get_parent: () => undefined,
        getCatnames: tags => ['公園', '', tags.leisure ?? '', ''],
        getOSMname: tags => tags?.name ?? ''
    }
});
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../lib/areafeaturelinker.js'), 'utf8')
        + '\nthis.AreaFeatureLinker = AreaFeatureLinker;',
    context
);

const linker = new context.AreaFeatureLinker();
const first = linker.rebuildIndex();
assert.equal(first.length, 1);

features.push(area('way/2'));
targets.push(['Playgrounds_Park']);
assert.strictEqual(linker.rebuildIndex(), first);
assert.equal(linker.records.length, 1);

context.poiCont.revision++;
const rebuilt = linker.rebuildIndex();
assert.notStrictEqual(rebuilt, first);
assert.equal(rebuilt.length, 2);

context.glot.lang = 'en';
assert.notStrictEqual(linker.rebuildIndex(), rebuilt);
console.log('PASS: area records rebuild only when POI/activity data or language changes');
