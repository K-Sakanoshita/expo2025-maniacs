const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("index.html", "utf8");
const base = fs.readFileSync("baselist.html", "utf8");
assert.match(base, /id="poiFilterButton"[\s\S]*?aria-controls="poiFilterModal"/);
assert.doesNotMatch(base, /id="filter_menu"|id="sub_menu"/);
assert.match(html, /id="poiFilterVisited"/);
assert.doesNotMatch(html, /id="poiFilterFavoriteOnly"|id="poiFilterPresets"|onchange="cMapMaker.setVisitedFilter/);
assert.match(html, /id="placeCriteriaSearch"/);
assert.doesNotMatch(html, /id="poiFilterDescription"/);
const css = fs.readFileSync("common-ui.css", "utf8");
assert.match(html, /id="poiFilterModal" class="modal"/);
assert.doesNotMatch(html, /id="poiFilterModal" class="[^"]*\bfade\b/);
assert.match(html, /class="modal-dialog modal-dialog-scrollable modal-lg"/);
assert.match(html, /class="modal-content poi-filter-panel"/);
assert.match(html, /data-bs-dismiss="modal"/);
assert.doesNotMatch(html, /areaFeatureReport/);
assert.match(html, /class="modal-header app-modal-header"/);
assert.match(html, /class="modal-body"/);
assert.match(html, /id="poiFilterActions" class="modal-footer"/);
assert.doesNotMatch(css, /\.area-feature-dialog\s*\{/);
assert.doesNotMatch(css, /body\.modal-open #btmHeader\s*\{/);

const source = fs.readFileSync("lib/areasearchcontroller.js", "utf8");
let showCount = 0;
let hideCount = 0;
const modal = {
    show: () => { showCount += 1; },
    hide: () => { hideCount += 1; }
};
const elements = new Map();
const element = () => ({ hidden: false, textContent: "" });
["poiFilterModal", "poiFilterSearchContent", "poiFilterResearchContent", "poiFilterRatingContent", "poiFilterTitle",
    "poiFilterZoomNotice", "poiFilterActions", "poiFilterPersonal", "poiFilterFavoriteOnly"].forEach(id => elements.set(id, element()));

const context = {
    console,
    Conf: { areaSearch: { use: true }, google: {}, etc: { localSave: "test" } },
    document: { getElementById: id => elements.get(id) ?? null, querySelectorAll: () => [] },
    bootstrap: { Modal: { getOrCreateInstance: () => modal } },
    mapLibre: { getZoom: () => 15 },
    cMapMaker: { getPoiZoom: () => 13 }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.TestAreaSearchController = AreaSearchController;`, context);

const controller = new context.TestAreaSearchController({
    records: [],
    rebuildIndex: () => [],
    configuredTargets: () => []
});
controller.updatePreviewCount = () => {};
context.cMapMaker.favoriteFilter = true;
controller.open("search");
assert.strictEqual(elements.get("poiFilterPersonal").hidden, false);

assert.strictEqual(elements.get("poiFilterTitle").textContent, "詳しい条件");
assert.strictEqual(elements.get("poiFilterSearchContent").hidden, false);
assert.strictEqual(elements.get("poiFilterActions").hidden, false);
controller.open("rating");
assert.strictEqual(elements.get("poiFilterPersonal").hidden, true);
assert.strictEqual(elements.get("poiFilterRatingContent").hidden, false);
assert.strictEqual(elements.get("poiFilterActions").hidden, true);
controller.open("research");
assert.strictEqual(elements.get("poiFilterResearchContent").hidden, false);
controller.close();

assert.strictEqual(showCount, 3);
assert.strictEqual(hideCount, 1);
controller.usesSearchApi = () => true;
controller.searchBbox = () => "135,34,136,35";
controller.open("search");
controller.searchBbox = () => null;
controller.open("search");
controller.usesSearchApi = () => false;
context.Conf.etc.localSave = "";
context.cMapMaker.favoriteFilter = false;
controller.open("search");
assert.strictEqual(elements.get("poiFilterPersonal").hidden, true);

context.Conf.areaSearch.use = false;
controller.open("search");
assert.strictEqual(elements.get("poiFilterSearchContent").hidden, true);
assert.strictEqual(elements.get("poiFilterActions").hidden, true);
context.Conf.areaSearch = {
    attributes: ["quiet"],
    presets: { temple: { icon: "⛩️", scoreMin: 4 } }
};
context.glot = { get: key => ({
    areaSearch_heading_search: "Find places",
    areaSearch_attribute_quiet: "Quiet",
    areaSearch_preset_temple: "Find shrines"
})[key] };
const generic = new context.TestAreaSearchController({});
assert.strictEqual(generic.label("heading.search"), "Find places");
assert.strictEqual(generic.attributeLabel("quiet"), "Quiet");
assert.strictEqual(generic.presetLabel("temple"), "Find shrines");
assert.deepStrictEqual(JSON.parse(JSON.stringify(generic.presetCriteria("temple"))),
    { scoreMin: 4, attributes: [], matchMode: "and" });
console.log("PASS: area search uses Bootstrap modal markup and show/hide API");
