const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let day = '2026-10-11T23:59:00';
class Clock extends Date { constructor() { super(day); } }
const values = new Map();
const splash = { hidden: false };
const frames = [];
let requests = 0, delays = [], responseOk = true, otherModalOpen = true;
const context = {
    Date: Clock, URL, location: { href: 'https://example.test/index.html' },
    console: { warn() {} },
    window: {
        localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
        requestAnimationFrame: fn => frames.push(fn),
        setTimeout: (fn, delay) => { delays.push(delay); fn(); }
    },
    document: { getElementById: () => splash, querySelector: () => otherModalOpen ? {} : null },
    fetch: async url => {
        requests++;
        assert.match(url, /updates-(ja|en)\.html\?ver=v\d/);
        return { ok: responseOk, status: 404, text: async () => '<h3>公開しました</h3>' };
    },
    AppModal: class {
        constructor(options) { this.options = options; this.element = { addEventListener() {} }; }
        show() { this.isOpen = true; this.options.onShown(); }
        hide() { this.isOpen = false; }
    }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('lib/siteupdates.js', 'utf8') + '\nthis.Controller = SiteUpdatesController;', context);
const config = { use: true, autoOpen: 'daily', delayMs: 120, version: 'v1', storageKey: 'expo.test',
    title: { ja: '更新履歴', en: 'Updates' }, contentUrl: { ja: './updates-ja.html', en: './updates-en.html' } };
(async () => {
    const controller = new context.Controller(config);
    const first = controller.autoShow();
    assert.equal(await controller.autoShow(), false); // Concurrent startup is ignored.
    while (!frames.length) await Promise.resolve();
    assert.equal(values.size, 0); // Do not mark read before the splash closes.
    assert.equal(controller.modal.isOpen, undefined);
    splash.hidden = true;
    frames.shift()();
    assert.equal(controller.modal.isOpen, undefined); // Another modal still occupies the screen.
    otherModalOpen = false;
    frames.shift()();
    assert.equal(await first, true);
    assert.equal(controller.modal.options.title, '更新履歴');
    assert.equal(controller.modal.options.html, '<h3>公開しました</h3>');
    assert.deepEqual(delays, [120]);
    assert.equal(values.get('expo.test.date'), '2026-10-11');
    controller.modal.hide();
    assert.equal(await new context.Controller(config).autoShow(), false); // Page reload, same browser/day.
    assert.equal(requests, 1); // No content request when suppressed.
    day = '2026-10-12T00:01:00';
    const next = new context.Controller(config, 'en');
    assert.equal(await next.autoShow(), true);
    assert.equal(next.modal.options.title, 'Updates');
    next.modal.hide();
    assert.equal(await new context.Controller({ ...config, autoOpen: 'version' }).autoShow(), false);
    const version = new context.Controller({ ...config, autoOpen: 'version', version: 'v2' });
    assert.equal(await version.autoShow(), true);
    version.modal.hide();
    assert.equal(await new context.Controller({ ...config, autoOpen: 'version', version: 'v2' }).autoShow(), false);
    for (const autoOpen of ['never', 'invalid'])
        assert.equal(await new context.Controller({ ...config, autoOpen }).autoShow(), false);
    assert.equal(await new context.Controller({ ...config, use: false, autoOpen: 'always' }).autoShow(), false);
    const always = new context.Controller({ ...config, autoOpen: 'always' });
    assert.equal(await always.autoShow(), true);
    always.modal.hide();
    assert.equal(await always.autoShow(), true);
    always.modal.hide();
    responseOk = false;
    const failed = new context.Controller({ ...config, storageKey: 'failed' });
    assert.equal(await failed.autoShow(), false);
    assert.equal(values.has('failed.date'), false);
    responseOk = true;
    context.window.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
    const blocked = new context.Controller(config);
    assert.equal(await blocked.autoShow(), true);
    blocked.modal.hide();
    assert.equal(await blocked.autoShow(), false); // In-memory fallback in this page.
    console.log('PASS: first visit per local day, reload, next day, policies, splash, delay, concurrency and failures');
})().catch(error => { console.error(error); process.exitCode = 1; });
