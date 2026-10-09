const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const requests = [];
let bounds = { NW: { lng: 135, lat: 35 }, SE: { lng: 136, lat: 34 } };
const context = {
    console,
    URL,
    location: { href: 'https://example.test/map/' },
    Conf: { activity: { url: 'https://example.test/api/activities.php?app=playgrounds', authMode: 'basic' }, areaSearch: {} },
    mapLibre: { get_LL: () => bounds },
    fetch: async url => {
        const parsed = new URL(url);
        requests.push(parsed);
        const page = Number(parsed.searchParams.get('page'));
        return { ok: true, json: async () => ({
            status: 'ok', items: [{ osmid: `way/${page}` }],
            pagination: { total: 2, total_pages: 2 }
        }) };
    }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(`${fs.readFileSync('lib/areasearchcontroller.js', 'utf8')}\nglobalThis.Controller = AreaSearchController;`, context);
const controller = new context.Controller({});
(async () => {
    const result = await controller.fetchSearch({ scoreMin: 4 }, undefined);
    assert.strictEqual(result.items.length, 2);
    assert.deepStrictEqual(requests.map(url => url.searchParams.get('bbox')), ['135,34,136,35', '135,34,136,35']);
    assert.deepStrictEqual(requests.map(url => url.searchParams.get('page')), ['1', '2']);
    requests.length = 0;
    bounds = { NW: { lng: 179, lat: 35 }, SE: { lng: 181, lat: 34 } };
    await controller.fetchSearch({}, undefined, true);
    assert.strictEqual(requests[0].searchParams.has('bbox'), false);
    assert.strictEqual(requests.length, 1);
    console.log('PASS: area search uses viewport bbox for all pages and preserves fallback');
})().catch(error => { console.error(error); process.exitCode = 1; });
