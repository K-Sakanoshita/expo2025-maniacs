"use strict";

// Suggestions use already loaded records only; no data transport.
class PlaceDiscoveryController {
    constructor() {
        this.purpose = "";
    }

    get settings() { return Conf.discovery ?? {}; }
    text(key) { return glot.get(`discovery_${key}`); }

    facts(record) {
        const attributes = (record.attributes ?? []).filter(code => areaSearchController.attributes.includes(code));
        const facts = attributes.slice(0, 2).map(code => areaSearchController.attributeLabel(code));
        for (const rule of this.settings.featureFacts ?? []) {
            if (facts.length >= 2) break;
            if ((record.linkedFeatures ?? []).some(item => item.feature?.properties?.[rule.key] === rule.value)) {
                const label = glot.get(rule.labelKey);
                if (!facts.includes(label)) facts.push(label);
            }
        }
        if (facts.length < 2 && record.score > 0) facts.push(`★${record.score} (${this.text("reviews")})`);
        return facts.slice(0, 2);
    }

    photo(record) {
        // Reuse image blobs already resolved by the normal thumbnail strip.
        const loaded = [...document.querySelectorAll("#images img[osmid]")].find(image =>
            areaFeatureLinker.resolveAreaId(image.getAttribute("osmid")) === record.areaId
            && image.complete && image.naturalWidth > 0
            && /^(blob:|https?:\/\/)/i.test(image.getAttribute("src") || "")
            && !image.dataset.lazySrc?.startsWith("data:"));
        if (loaded && (loaded.getAttribute("src_thumb") || loaded.getAttribute("src_org"))) return loaded.src;
        // Direct photo URLs only. File: references must not trigger Wikimedia lookups.
        const pattern = Conf.areaFeatureLinker?.photoFieldPattern || "^picture_url\\d+$";
        let expression;
        try { expression = new RegExp(pattern); } catch { return ""; }
        for (const activity of record.activities ?? []) {
            for (const [key, value] of Object.entries(activity)) {
                if (expression.test(key) && /^https?:\/\//i.test(String(value))) return String(value);
            }
        }
        return "";
    }

    decorate(item, record) {
        if (this.settings.use !== true || !record) return;
        const facts = document.createElement("div");
        facts.className = "place-facts";
        for (const text of this.facts(record)) {
            const chip = document.createElement("span");
            chip.textContent = text;
            facts.appendChild(chip);
        }
        item.appendChild(facts);
        const image = document.createElement("img");
        image.className = "place-preview-image";
        image.dataset.placeId = record.areaId;
        image.loading = "lazy";
        image.width = 96;
        image.height = 72;
        image.alt = record.name;
        image.hidden = true;
        image.addEventListener("error", () => { image.hidden = true; });
        const source = this.photo(record);
        if (source) { image.src = source; image.hidden = false; }
        item.prepend(image);
    }

    refreshPhotos() {
        for (const image of document.querySelectorAll(".place-preview-image[data-place-id]")) {
            const record = areaFeatureLinker.getAreaRecord(image.dataset.placeId);
            if (!record) continue;
            const source = this.photo(record);
            if (source && image.getAttribute("src") !== source) { image.src = source; image.hidden = false; }
        }
    }

    choose(purpose) {
        this.purpose = purpose;
        if (purpose === "custom") return areaSearchController.open("search");
        if (purpose) return areaSearchController.applyLocalPreset(purpose);
        areaSearchController.clear();
    }

    render() {
        const host = document.getElementById("placeDiscovery");
        if (!host) return;
        host.hidden = this.settings.use !== true;
        if (host.hidden || typeof areaFeatureLinker === "undefined") return;
        if (!this.initialized) {
            this.initialized = true;
            document.getElementById("images")?.addEventListener("load", () => this.refreshPhotos(), true);
        }
        this.purpose = areaSearchController.activeCriteria?.preset || (areaSearchController.activeCriteria ? "custom" : "");
        const label = document.createElement("label");
        label.htmlFor = "placePurpose";
        label.textContent = this.text("purpose");
        const select = document.createElement("select");
        select.id = "placePurpose";
        select.className = "form-select form-select-sm";
        const options = [["", this.text("any")], ...(this.settings.presetIds ?? Object.keys(areaSearchController.presetDefinitions))
            .filter(id => areaSearchController.presetDefinitions[id])
            .map(id => [id, areaSearchController.presetLabel(id)])];
        if (this.purpose === "custom") options.push(["custom", this.text("custom")]);
        for (const [value, text] of options) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            select.appendChild(option);
        }
        select.value = this.purpose;
        select.addEventListener("change", () => this.choose(select.value));
        host.replaceChildren(label, select);
    }
}
