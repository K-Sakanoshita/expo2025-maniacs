const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const records = new Map();
function record(id, file, lnglat = [135, 34], targets = ['pavilion']) {
    records.set(id, { lnglat, targets, geojson: { properties: {
        name: id, wikimedia_commons: file
    } } });
}
record('way/1', 'File:Pavilion.jpg');
record('way/2', 'Category:Pavilions');
record('way/3', 'File:Distant.jpg', [0, 0]);
record('way/4', 'File:Hidden.jpg', [135, 34], ['hidden']);
record('way/5', 'File:');
record('way/6', undefined);
record('way/7', '  File:Another pavilion.jpg  ');
record('way/8', 'File:Unknown position.jpg', null);
let zoom = 18;
const context = {
    Conf: { osm: { pavilion: { expression: { poiView: true } },
        hidden: { expression: { poiView: false } } } },
    mapLibre: { get_LL: () => ({}), getZoom: () => zoom },
    geoCont: { checkInner: ([lng, lat]) => lng === 135 && lat === 34 },
    cMapMaker: { getPoiZoom: () => 15 }, glot: { lang: 'ja' },
    poiCont: { get_osmid: id => records.get(id), getOSMname: tags => tags.name,
        getCatnames: () => ['施設'] }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('lib/listtable.js', 'utf8') + '\nthis.table = new ListTable();', context);
context.table.getMarkerList = () => [...records.keys(), 'way/1'].map(id => [id]);
const result = JSON.parse(JSON.stringify(context.table.getThumbnailOsmImages()));
assert.deepEqual(result, [
    { src: ['File:Pavilion.jpg'], osmid: 'way/1', title: 'way/1' },
    { src: ['File:Another pavilion.jpg'], osmid: 'way/7', title: 'way/7' }
]);
zoom = 14;
assert.equal(context.table.getThumbnailOsmImages().length, 0);
console.log('PASS: OSM Commons thumbnails respect File tags, bounds, zoom and POI visibility; repeated facilities are deduplicated');

let displayed;
const makerSource = fs.readFileSync('cmapmaker.js', 'utf8');
const method = makerSource.slice(makerSource.indexOf('    makeImages(view) {'),
    makerSource.indexOf('    usesActivityBbox() {'));
const ui = {
    Conf: { activities: { activity: { form: { picture: { type: 'image_url' } } } },
        thumbnail: { limits: 20 }, etc: { loadingUrl: 'loading.svg' } },
    basic: { shuffleArray: rows => rows },
    listTable: { getFilterList: () => [['way/1'], ['way/7']],
        getThumbnailActivities: () => [{ id: 'activity/1', osmid: 'way/1',
            title: '投稿', picture: 'File:Pavilion.jpg' }],
        getThumbnailOsmImages: () => result },
    images: { classList: { remove() {}, contains: () => false }, offsetHeight: 80 },
    dummy: { style: {} }, requestAnimationFrame: cb => cb(),
    winCont: { setImages: (dom, acts) => { displayed = acts; } }, console
};
vm.createContext(ui);
vm.runInContext('this.maker = new (class {' + method + '})();', ui);
ui.maker.makeImages(true);
assert.equal(displayed.length, 2);
assert.equal(displayed[0].title, '投稿');
assert.equal(displayed[1].osmid, 'way/7');
ui.listTable.getThumbnailActivities = () => [];
ui.maker.makeImages(true);
assert.equal(displayed.length, 2);
assert.equal(displayed[0].osmid, 'way/1');
console.log('PASS: thumbnail strip merges OSM images with activities, removes duplicates and works without activities');
