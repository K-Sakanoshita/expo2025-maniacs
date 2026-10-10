const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
    constructor(tag) {
        this.tagName = tag;
        this.children = [];
        this.listeners = new Map();
        this.classes = [];
        this.classList = { add: name => this.classes.push(name) };
        this.isConnected = true;
    }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.append(child); }
    replaceChildren(...children) { this.children = children; this.innerHTML = ''; }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(type, fn, options) {
        const handlers = this.listeners.get(type) || [];
        handlers.push({ fn, once: options?.once });
        this.listeners.set(type, handlers);
    }
    emit(type) {
        const handlers = this.listeners.get(type) || [];
        this.listeners.set(type, handlers.filter(handler => !handler.once));
        handlers.forEach(handler => handler.fn());
    }
    focus() { this.focused = true; }
    remove() { this.isConnected = false; }
}
const trigger = new Element('button');
const instances = [];
const context = {
    document: { createElement: tag => new Element(tag), body: new Element('body'), activeElement: trigger },
    glot: { get: () => '閉じる' },
    bootstrap: { Modal: { getOrCreateInstance(element) {
        const instance = {
            show() { element.emit('show.bs.modal'); element.emit('shown.bs.modal'); },
            hide() { element.emit('hide.bs.modal'); },
            finishHide() { element.emit('hidden.bs.modal'); },
            dispose() { this.disposed = true; }
        };
        instances.push(instance);
        return instance;
    } } }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('lib/appmodal.js', 'utf8') + '\nthis.Modal = AppModal;', context);
const calls = [];
const modal = new context.Modal({
    title: '<b>更新履歴</b>', html: '<p>リンク付きの<strong>お知らせ</strong></p>', size: 'lg',
    onShow: () => calls.push('show'), onShown: () => calls.push('shown'), onHidden: () => calls.push('hidden')
});
assert.equal(modal.title.textContent, '<b>更新履歴</b>'); // Title is plain text.
assert.equal(modal.body.innerHTML, '<p>リンク付きの<strong>お知らせ</strong></p>');
assert.equal(modal.element['aria-labelledby'], modal.title.id);
assert.equal(modal.closeButton['aria-label'], '閉じる');
assert.ok(modal.dialog.classes.includes('modal-lg'));
modal.show();
assert.equal(modal.isOpen, true);
modal.closeButton.emit('click');
assert.equal(trigger.focused, undefined); // Wait for Bootstrap's hidden event.
instances[0].finishHide();
assert.equal(modal.isOpen, false);
assert.equal(trigger.focused, true);
assert.deepEqual(calls, ['show', 'shown', 'hidden']);
const content = new Element('button');
let clicked = 0;
content.addEventListener('click', () => clicked++);
modal.setTitle('新しい題名').setContent(content);
modal.body.children[0].emit('click');
assert.equal(clicked, 1);
assert.equal(modal.title.textContent, '新しい題名');
modal.toggle();
assert.equal(modal.isOpen, true);
modal.dispose();
assert.equal(instances[0].disposed, undefined); // Do not leak a backdrop by disposing early.
assert.equal(modal.element.isConnected, true);
instances[0].finishHide();
assert.equal(instances[0].disposed, true);
assert.equal(modal.element.isConnected, false);
const second = new context.Modal({ title: '別のモーダル', closeLabel: 'Close' });
assert.notEqual(second.element.id, modal.element.id);
assert.equal(second.closeButton['aria-label'], 'Close');
second.dispose();
assert.equal(instances[1].disposed, true);
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const group = manifest.scriptGroups.find(group => group.name === 'app-local-ordered');
assert.ok(group.scripts.indexOf('./lib/appmodal.js') < group.scripts.indexOf('./lib/newstickerview.js'));
console.log('PASS: HTML/DOM content, titles, independent IDs, lifecycle, focus restoration and disposal');
