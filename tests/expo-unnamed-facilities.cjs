const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const parse = file => vm.runInNewContext('(' + fs.readFileSync(file, 'utf8') + ')');
const config = parse('data/listtable.jsonc');
const messages = { ...parse('data/glot-system.jsonc'), ...parse('data/glot-custom.jsonc') };

function element() {
    const classes = new Set();
    return { children: [], dataset: {}, className: '',
        classList: { add: value => classes.add(value), contains: value => classes.has(value) },
        addEventListener() {}, setAttribute() {},
        appendChild(child) { this.children.push(child); },
        prepend(child) { this.children.unshift(child); } };
}

for (const lang of ['ja', 'en']) {
    const category = parse(`data/category-${lang}.jsonc`).category;
    const listArea = element();
    const tags = {
        'node/1': { id: 'node/1', amenity: 'toilets' },
        'node/2': { id: 'node/2', amenity: 'toilets', name: 'Named toilet' },
        'node/3': { id: 'node/3', amenity: 'drinking_water' },
        'node/4': { id: 'node/4' }
    };
    const rows = Object.entries(tags).map(([id, tags]) =>
        [id, 'A01', tags.name ?? '', '', tags.amenity ? `amenity=${tags.amenity}` : '*=*', ['facilities'], 'toilet.png']);
    rows[2][2] = '  ';
    const context = vm.createContext({ console,
        Conf: { ...config, listTable: { ...config.listTable, category: 'menu', target: 'targets' },
            category, category_keys: Object.keys(category),
            osm: { facilities: { expression: { poiView: true } } } },
        glot: { lang, get: key => messages[key]?.[lang] ?? key },
        document: { getElementById: id => id === 'listArea' ? listArea : null,
            querySelectorAll: () => [], createElement: element },
        window: { withAppAssetVersion: value => value },
        mapLibre: { map: { getLayer() {}, getSource() {} } },
        poiStatusCont: { getRecord: () => ({}) },
        list_category: { value: 'facilities' }, list_keyword: { value: '' }
    });
    vm.runInContext(fs.readFileSync('lib/poilib.js', 'utf8') + '\nthis.poiCont = new PoiCont();', context);
    Object.assign(context.poiCont, { getTargets: () => ['facilities'], makeList: () => rows,
        get_osmid: id => tags[id] ? { geojson: { properties: tags[id] } } : undefined,
        get_actid: () => undefined });
    vm.runInContext(fs.readFileSync('lib/listtable.js', 'utf8') + '\nthis.table = new ListTable();', context);
    context.table.init();
    context.table.makeList(false);
    const result = context.table.getFilterList();
    assert.equal(result[0][2], category.amenity.toilets);
    assert.equal(result[1][2], 'Named toilet');
    assert.equal(result[2][2], category.amenity.drinking_water);
    assert.equal(result[3][2], messages.listUnnamed[lang]);
    assert.equal(rows[0][2], '', 'fallback labels must not alter original source rows');
    context.table.makeListArea(result);
    const rendered = listArea.children.at(-1).children;
    for (const [index, row] of rendered.entries()) {
        const columns = row.children[0].children;
        assert.equal(columns[0].children[0].classList.contains('list-name-fallback'), false);
        assert.equal(columns[1].children[0].classList.contains('list-name-fallback'), index !== 1);
    }
    context.list_keyword.value = category.amenity.drinking_water;
    context.table.makeList(false);
    assert.deepEqual(Array.from(context.table.getFilterList(), row => row[0]), ['node/3']);
    context.list_keyword.value = messages.listUnnamed[lang];
    context.table.makeList(false);
    assert.deepEqual(Array.from(context.table.getFilterList(), row => row[0]), ['node/4']);
}
console.log('PASS: unnamed facilities use localized categories or unknown labels, search the same names, and mute only fallback name text');
