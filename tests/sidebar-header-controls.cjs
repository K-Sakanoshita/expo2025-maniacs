const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("index.html", "utf8");
const winlib = fs.readFileSync("lib/winlib.js", "utf8");
const css = fs.readFileSync("system.css", "utf8");
const listHeader = html.match(/<h2[^>]+id="listHeader"[\s\S]*?<\/h2>/)?.[0] ?? "";

assert.ok(listHeader, "listHeader must exist");
assert.match(listHeader, /id="sidebarMinimize"/);
assert.match(listHeader, /id="sidebarChange"/);
assert.match(html, /id="detailWindowControls"/);
assert.match(html, /id="listWindowControls"/);
assert.doesNotMatch(listHeader, /data-bs-toggle="collapse"/);
assert.doesNotMatch(html, /id="sidebarClose"/);
assert.match(html, /id="detailHeaderClose"/);
assert.match(winlib, /mode === "change" && this\.sidebarSize == 1 \? 2/);
assert.match(winlib, /mode === "mini" \? 1/);
assert.match(winlib, /const minListSize = this\.getSidebarMinimumSize\(isWide, total\)/);
assert.match(winlib, /case 1: btmHeight = this\.getSidebarMinimumSize\(false, maxHeight\)/);
assert.match(winlib, /case 1: btmWidth = this\.getSidebarMinimumSize\(true, maxWidth\)/);
assert.match(winlib, /if \(isWide\) return 48/);
assert.match(winlib, /setDetailHeaderMode\(viewDetail\)/);
assert.match(winlib, /listHeader\?\.classList\.toggle\("d-none", viewDetail\)/);
assert.match(winlib, /destination\.appendChild\(sidebarChange\)/);
assert.match(winlib, /makeDetail\(p\)\s*\{\s*this\.setDetailHeaderMode\(true\)/);
assert.match(fs.readFileSync("cmapmaker.js", "utf8"), /detailMenu\.classList\.add\("d-none"\)\s*winCont\.setDetailHeaderMode\(false\)/);

const elements = {};
const makeElement = (id) => elements[id] = {
    id,
    parentElement: null,
    hidden: false,
    classList: { toggle: (_name, value) => { elements[id].hidden = value; } },
    appendChild(child) { child.parentElement = this; }
};
const listHeaderElement = makeElement("listHeader");
const listControls = makeElement("listWindowControls");
const detailControls = makeElement("detailWindowControls");
const sidebarChange = makeElement("sidebarChange");
listControls.appendChild(sidebarChange);
const context = { document: { getElementById: id => elements[id] ?? null }, console };
vm.runInNewContext(`${winlib}\nglobalThis.TestWinCont = WinCont;`, context);
const controller = new context.TestWinCont();
controller.setDetailHeaderMode(true);
assert.equal(listHeaderElement.hidden, true);
assert.equal(sidebarChange.parentElement, detailControls);
controller.setDetailHeaderMode(false);
assert.equal(listHeaderElement.hidden, false);
assert.equal(sidebarChange.parentElement, listControls);
assert.match(winlib, /btmPane\.classList\.remove\("sidebar-minimized"\)/);
assert.match(css, /#bottom-pane\.sidebar-minimized\s*\{[\s\S]*?width:\s*48px\s*!important/);
assert.match(css, /#bottom-pane\.sidebar-minimized #sidebarMinimize\s*\{[\s\S]*?display:\s*none\s*!important/);
assert.match(winlib, /animateSidebarMapSize\('width', currentMapRect\.width, mapWidth\)/);
assert.match(winlib, /animateSidebarMapSize\('height', currentMapRect\.height, mapHeight\)/);
assert.doesNotMatch(winlib, /mapid\.style\.width = `\$\{maxWidth\}px`/);
assert.doesNotMatch(winlib, /mapid\.style\.height = `\$\{maxHeight\}px`/);

console.log("PASS: list header has minimize/maximize controls and detail retains close");
