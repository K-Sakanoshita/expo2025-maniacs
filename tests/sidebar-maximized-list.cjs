const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element(width = 0, height = 0) {
    const node = { width, height, dataset: {}, children: [],
        addEventListener() {},
        classList: { remove() {}, toggle() {}, add() {} },
        setAttribute() {}, appendChild(child) { this.children.push(child); },
        getBoundingClientRect() {
            const width = parseFloat(this.style.width) || this.width;
            const height = parseFloat(this.style.height) || this.height;
            return { left: 0, top: 0, right: width, bottom: height, width, height };
        },
        getAnimations: () => [],
        animate(frames) {
            this.animations.push(frames);
            return { playState: 'finished', finished: Promise.resolve() };
        }, animations: [] };
    node.style = { removeProperty(key) { delete this[key]; }, setProperty(key, value) { this[key] = value; } };
    return node;
}

async function checkViewport(wide) {
    const width = wide ? 1280 : 390;
    const height = wide ? 720 : 844;
    const map = element(wide ? 800 : width, wide ? height : height * .6);
    const pane = element(map.width, map.height);
    const elements = { 'top-pane': pane, 'bottom-pane': element(),
        sidebarMinimize: element(), sidebarChange: element(), 'mini-map': element() };
    const context = vm.createContext({ console: { log() {} },
        document: { getElementById: id => elements[id] },
        window: { innerWidth: width, innerHeight: height, matchMedia: () => ({ matches: wide }) },
        basic: { isSmartPhone: () => !wide }, mapid: map, article: element(), glot: { get: key => key },
        Conf: { sideBar: { everyView: true }, minimap: { height: 100 } },
        cMapMaker: {}, mapLibre: { stop() {}, start() {}, map: { resize() {} } },
        requestAnimationFrame: fn => fn() });
    vm.runInContext(fs.readFileSync('lib/winlib.js', 'utf8') + '\nthis.WinCont = WinCont;', context);
    const controller = new context.WinCont();
    controller.sidebarSize = 2;
    await controller.setSidebar('change');
    const dimension = wide ? 'width' : 'height';
    const expected = wide ? 800 : height * .6;
    assert.equal(parseFloat(map.style[dimension]), expected, 'maximizing retains the previous map viewport');
    for (const frames of map.animations) for (const frame of frames) {
        assert.ok(parseFloat(frame[dimension]) > 0, 'the map never collapses during animation');
    }
    controller.resizeWindow();
    assert.equal(parseFloat(map.style[dimension]), expected, 'window resize preserves the hidden viewport');
    await controller.setSidebar('redraw');
    assert.equal(parseFloat(map.style[dimension]), expected, 'redrawing the maximized list retains its viewport');
    await controller.setSidebar('change');
    assert.equal(parseFloat(map.style[dimension]), expected, 'restore fits the visible map pane');
    const abort = Object.assign(new Error('superseded layout'), { name: 'AbortError' });
    pane.animate = () => ({ finished: Promise.reject(abort) });
    await controller.setSidebar('change');
    assert.equal(parseFloat(map.style[dimension]), expected, 'cancelled animation leaves dimensions to the newer layout');
    pane.animate = () => ({ finished: Promise.reject(new Error('animation failure')) });
    await assert.rejects(controller.setSidebar('change'), /animation failure/);
}

function checkListClipping() {
    const listArea = element();
    let paneRect = { left: 0, top: 0, right: 800, bottom: 720, width: 800, height: 720 };
    const mapRect = { left: 0, top: 0, right: 800, bottom: 720, width: 800, height: 720 };
    const context = vm.createContext({ console: { log() {} },
        Conf: { listTable: { defaultView: 'area' }, list: { views: { area: { source: 'areaFeatureLinker', columns: [] } } } },
        window: { innerWidth: 1280, innerHeight: 720 },
        document: { getElementById: id => id === 'listArea' ? listArea
            : id === 'top-pane' ? { getBoundingClientRect: () => paneRect } : null,
            querySelectorAll: () => [], createElement: () => element() },
        mapLibre: { map: { getLayer() {}, getSource() {}, getContainer: () => ({ getBoundingClientRect: () => mapRect }),
            project: ([x, y]) => ({ x, y }) } },
        poiCont: { get_osmid: id => ({ lnglat: id === 'mock/inside' ? [100, 100] : [900, 100] }) },
        poiStatusCont: { getRecord: () => ({}) } });
    vm.runInContext(fs.readFileSync('lib/listtable.js', 'utf8') + '\nthis.ListTable = ListTable;', context);
    const table = new context.ListTable();
    table.init();
    const rows = [['mock/inside', 'Inside'], ['mock/outside', 'Outside']];
    const rendered = () => listArea.children.at(-1).children.map(node => node.dataset.id);
    table.makeListArea(rows);
    assert.deepEqual(rendered(), ['mock/inside']);
    for (const hidden of [{ width: 0, height: 720, right: 0, bottom: 720 },
        { width: 800, height: 0, right: 800, bottom: 0 }]) {
        paneRect = { left: 0, top: 0, ...hidden };
        table.makeListArea(rows);
        assert.deepEqual(rendered(), ['mock/inside'], 'a hidden map pane retains only rows within the saved viewport');
    }
    paneRect = { left: 0, top: 0, right: 50, bottom: 720, width: 50, height: 720 };
    table.makeListArea(rows);
    assert.deepEqual(rendered(), [], 'a visible pane still clips rows outside its displayed area');
}

(async () => {
    await checkViewport(true);
    await checkViewport(false);
    checkListClipping();
    console.log('PASS: maximized lists retain map viewport and POIs in both layouts, with normal clipping on restore');
})().catch(error => { console.error(error); process.exitCode = 1; });
