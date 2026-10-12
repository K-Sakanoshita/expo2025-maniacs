const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const classes = () => {
    const values = new Set();
    return { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value) };
};
const frames = [], timers = [], handlers = {};
const bounds = { left: 120, right: 320, top: 100, bottom: 180, width: 200, height: 80 };
const strip = { children: [], classList: classes(), scrollWidth: 400, clientWidth: 200,
    getBoundingClientRect: () => bounds,
    addEventListener: (type, handler) => { handlers[type] = handler; },
    removeEventListener: type => { delete handlers[type]; },
    append(image) { this.children.push(image); },
    querySelectorAll() { return this.children.filter(image => image.dataset.thumbnailLoaded === 'true'); },
    set innerHTML(value) { this.children = []; }
};
const hint = { style: {}, classList: classes() };
hint.classList.add('d-none');
const context = { console, images: strip, scrollHand: hint,
    Conf: { thumbnail: { limits: 10, slideThumbWidth: 160 } },
    window: { scrollX: 15, scrollY: 0, withAppAssetVersion: src => src },
    requestAnimationFrame: callback => frames.push(callback),
    setTimeout: callback => timers.push(callback),
    document: { createElement: () => {
        const listeners = {};
        return { dataset: {}, complete: false, naturalWidth: 0,
            rect: { ...bounds, right: 200, width: 80 },
            setAttribute() {}, addEventListener: (type, callback) => { listeners[type] = callback; },
            getBoundingClientRect() { return this.rect; },
            loaded() { this.complete = true; this.naturalWidth = 80; listeners.load(); }
        };
    } }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('lib/winlib.js', 'utf8') + '\nthis.win = new WinCont();', context);
let shown = 0;
const ready = () => { if (!shown && context.win.scrollHint()) shown++; };
const acts = [{ src: ['photo.jpg'], osmid: 'way/1', title: 'photo' }];
const flush = () => { while (frames.length) frames.shift()(); };
context.win.setImages(strip, acts, 'loading.svg', 10, ready);
assert.equal(shown, 0, 'allocating thumbnails must not display the hint');
const image = strip.children[0];
image.src = 'loading.svg'; image.loaded(); flush();
assert.equal(shown, 0, 'the loading placeholder is not a photo');
image.src = 'photo.jpg';
image.rect = { ...bounds, left: 340, right: 420, width: 80 };
image.loaded(); flush();
assert.equal(shown, 0, 'preloaded photos outside the visible strip must not show the hint');
image.rect = { ...bounds, right: 200, width: 80 };
strip.scrollWidth = strip.clientWidth;
handlers.scroll();
assert.equal(shown, 0, 'non-scrollable photos must not consume the one-time hint');
strip.scrollWidth = 400;
strip.classList.add('d-none'); handlers.scroll();
assert.equal(shown, 0, 'hidden photos must not show the hint');
strip.classList.remove('d-none'); handlers.scroll();
assert.equal(shown, 1);
assert.equal(hint.style.left, "135px", "align with the thumbnail strip including page scroll");
assert.equal(hint.style.width, "200px", "center within the strip, not the entire viewport");
assert.equal(hint.classList.contains('d-none'), false);
context.win.setImages(strip, acts, 'loading.svg', 10, ready);
assert.equal(shown, 1, 'reusing loaded photos must not repeat the hint');
timers[0]();
assert.equal(hint.classList.contains('d-none'), true);
context.win.disconnectImageObserver();
assert.equal(handlers.scroll, undefined);
console.log('PASS: hint waits for a visible loaded photo, requires overflow and appears once');
