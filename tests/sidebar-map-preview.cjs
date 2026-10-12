const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const listeners = new Set();
let paints = 0, captures = 0;
const source = { width: 1320, height: 1722 };
const container = { children: [], appendChild(node) { this.children.push(node); } };
const map = {
    getCanvas: () => source, getCanvasContainer: () => container,
    once: (_type, handler) => listeners.add(handler),
    off: (_type, handler) => listeners.delete(handler),
    triggerRepaint: () => { paints++; }
};
const context = vm.createContext({ mapLibre: { map }, console,
    document: { createElement: () => ({ setAttribute() {},
        getContext: () => ({ drawImage(canvas) { assert.equal(canvas, source); captures++; } }),
        remove() { container.children = container.children.filter(node => node !== this); }
    }) }
});
vm.runInContext(fs.readFileSync('lib/winlib.js', 'utf8') + '\nthis.win = new WinCont();', context);
const render = () => {
    const handlers = [...listeners];
    for (const handler of handlers) { listeners.delete(handler); handler(); }
};
context.win.beginSidebarMapPreview();
assert.equal(container.children.length, 0, 'capture must wait for a rendered frame');
render();
assert.equal(captures, 1);
assert.equal(container.children.length, 1);
assert.equal(container.children[0].width, 1320);
assert.equal(container.children[0].height, 1722);
context.win.finishSidebarMapPreview();
assert.equal(container.children.length, 1, 'retain the preview until the resized map is rendered');
render();
assert.equal(container.children.length, 0);
assert.equal(listeners.size, 0);
context.win.beginSidebarMapPreview();
render();
context.win.finishSidebarMapPreview();
context.win.beginSidebarMapPreview();
assert.equal(container.children.length, 0, 'a new drag cleans up the old preview');
assert.equal(listeners.size, 1, 'stale completion handlers are removed');
render();
assert.equal(container.children.length, 1);
context.win.clearSidebarMapPreview();
assert.equal(container.children.length, 0);
assert.equal(listeners.size, 0);
assert.equal(paints, 5);
console.log('PASS: rendered map capture persists through resize, then cleans up; repeated drags do not leak');
