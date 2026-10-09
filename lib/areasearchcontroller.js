"use strict";

// Configurable search UI for records created by AreaFeatureLinker.
class AreaSearchController {
    constructor(linker) {
        this.linker = linker;
        this.activeCriteria = null;
        this.activeAreaIds = new Set();
        this.initialized = false;
        this.apiRecords = [];
        this.searchRevision = 0;
        this.previewRevision = 0;
        this.apiState = "";
    }

    get settings() { return Conf?.areaSearch ?? {}; }
    get attributes() { return this.settings.attributes ?? []; }
    get presetDefinitions() { return this.settings.presets ?? {}; }

    usesSearchApi() {
        if (this.localOnly) return false;
        return Conf.activity?.authMode === "basic"
            && Boolean(this.remoteSearch);
    }

    get listRecords() {
        return this.activeCriteria && this.usesSearchApi() ? this.apiRecords : this.visibleRecords();
    }

    searchBbox() {
        let bounds;
        try { bounds = mapLibre.get_LL(); } catch (_) { return null; }
        const west = Number(bounds?.NW?.lng);
        const south = Number(bounds?.SE?.lat);
        const east = Number(bounds?.SE?.lng);
        const north = Number(bounds?.NW?.lat);
        if (![west, south, east, north].every(Number.isFinite)
            || west >= east || south >= north) return null;
        // The API accepts one non-wrapping box. Keep the full search when the view crosses the date line.
        if (west < -180 || east > 180) {
            if (west <= -180 && east >= 180) return "-180,-90,180,90";
            return null;
        }
        const clippedSouth = Math.max(-90, south);
        const clippedNorth = Math.min(90, north);
        return clippedSouth < clippedNorth ? [west, clippedSouth, east, clippedNorth].join(",") : null;
    }

    async fetchSearch(criteria, signal, countOnly = false) {
        const source = new URL(Conf.activity.url, location.href);
        const url = new URL(this.settings.apiUrl || "activity-search.php", source);
        url.search = "";
        const app = this.settings.app || source.searchParams.get("app");
        if (app) url.searchParams.set("app", app);
        const parameters = {
            score_min: criteria.scoreMin ?? 0,
            attributes: (criteria.attributes ?? []).join(","),
            match_mode: criteria.matchMode ?? "and",
            recent_only: Number(Boolean(criteria.recentOnly)),
            photo_only: Number(Boolean(criteria.photoOnly)),
            detail_only: Number(Boolean(criteria.detailOnly)),
            research_mode: criteria.researchMode ?? "",
            per_page: countOnly ? 1 : 500
        };
        Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
        const bbox = this.searchBbox();
        if (bbox !== null) url.searchParams.set("bbox", bbox);
        const items = [];
        let total = 0;
        for (let page = 1; ; page++) {
            url.searchParams.set("page", page);
            const response = await fetch(url.href, { headers: { Accept: "application/json" }, signal });
            if (!response.ok) throw new Error(`Activity search: HTTP ${response.status}`);
            const data = await response.json();
            if (data.status !== "ok" || !Array.isArray(data.items)
                || !Number.isInteger(data.pagination?.total_pages)
                || !Number.isInteger(data.pagination?.total)) throw new Error("Invalid activity search response");
            items.push(...data.items);
            total = data.pagination.total;
            if (countOnly || page >= data.pagination.total_pages) break;
        }
        return { items, total };
    }

    apiRecord(item) {
        const osm = poiCont.get_osmid(item.osmid);
        const activity = poiCont.get_actid(item.latest_activity_id);
        return {
            areaId: item.osmid,
            name: (osm && poiCont.getOSMname(osm.geojson?.properties ?? {}, glot.lang))
                || activity?.title || item.osmid,
            feature: osm?.geojson, lng: osm?.lnglat?.[0], lat: osm?.lnglat?.[1],
            linkedFeatures: [], activities: activity ? [activity] : [],
            score: item.score, attributes: item.attributes ?? [], confirmed: item.confirmed,
            hasPhoto: item.has_photo, hasDetail: item.has_detail, memo: item.memo,
            activityId: item.latest_activity_id, isRecent: item.is_recent,
            informationCount: item.information_count
        };
    }

    async syncSearch({ request = false } = {}) {
        if (!request && this.activeCriteria && this.usesSearchApi()) {
            if (this.resultBbox === this.searchBbox()) return;
            this.localOnly = true;
            this.remoteSearch = false;
        }
        const revision = ++this.searchRevision;
        this.searchAbort?.abort();
        if (!this.activeCriteria || !this.usesSearchApi()) {
            this.apiState = "";
            this.apiRecords = [];
            this.rebuildRecords();
            return;
        }
        this.resultBbox = this.searchBbox();
        const controller = this.searchAbort = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        this.apiRecords = [];
        this.activeAreaIds.clear();
        this.apiState = "loading";
        this.renderSummary();
        try {
            const result = await this.fetchSearch(this.activeCriteria, controller.signal);
            if (revision !== this.searchRevision || !this.usesSearchApi()) return;
            this.apiRecords = result.items.map(item => this.apiRecord(item));
            this.activeAreaIds = new Set(this.apiRecords.map(record => record.areaId));
            this.apiState = "ready";
        } catch (error) {
            if (revision !== this.searchRevision) return;
            this.apiState = "error";
            console.warn("Activity search failed", error);
        } finally {
            clearTimeout(timeout);
        }
    }

    translated(key, fallback = "") {
        const value = typeof glot !== "undefined" ? glot.get(key) : null;
        return value == null || value === key ? String(fallback) : String(value);
    }

    label(path, fallback = "") {
        return this.translated(`areaSearch_${String(path).replaceAll(".", "_")}`, fallback);
    }

    attributeLabel(code) {
        return this.translated(`areaSearch_attribute_${code}`, code);
    }

    presetLabel(name) {
        return this.translated(`areaSearch_preset_${name}`, name);
    }

    localizeUi() {
        document.querySelectorAll("[data-area-label]").forEach(node => {
            node.textContent = this.translated(node.dataset.areaLabel, node.textContent);
        });
        document.querySelectorAll("[data-area-aria]").forEach(node => {
            node.setAttribute("aria-label", this.translated(node.dataset.areaAria, node.getAttribute("aria-label")));
        });
        this.renderAttributeOptions();
        if (this.activeCriteria) this.renderSummary();
        else this.renderDisplayStatus();
    }

    renderDisplayStatus() {
        const container = document.getElementById("mapDisplayTargets");
        if (!container) return;
        const reasonPanel = document.getElementById("mapDisplayReason");
        if (reasonPanel) reasonPanel.hidden = true;
        const targets = Object.keys(Conf.poiView?.poiZoom ?? {})
            .filter(target => Conf.osm?.[target]?.expression?.poiView);
        const selected = typeof list_category === "undefined" ? "" : String(list_category.value || "");
        const selectedTarget = selected.split(",").find(target => targets.includes(target));
        const conditionRow = document.getElementById("mapDisplayConditions");
        const conditionChips = document.getElementById("mapDisplayConditionChips");
        if (conditionRow && conditionChips) {
            const conditions = [];
            if (selected && typeof list_category !== "undefined") {
                conditions.push(list_category.selectedOptions[0]?.textContent?.trim() || selected);
            }
            const keyword = document.getElementById("list_keyword")?.value.trim();
            if (keyword) conditions.push(`${this.translated("mapDisplay_keyword", "キーワード")}：${keyword}`);
            conditionChips.replaceChildren(...conditions.map(value => {
                const chip = document.createElement("span");
                chip.className = "map-display-condition-chip";
                chip.textContent = value;
                return chip;
            }));
            conditionRow.hidden = conditions.length === 0;
        }
        const zoom = Number(mapLibre.getZoom(false));
        container.replaceChildren(...targets.map(target => {
            const expression = Conf.osm[target].expression;
            const threshold = Number(globalThis.cMapMaker?.getPoiZoom?.(target)
                ?? Conf.poiView.poiZoom[target]);
            const configured = Boolean(expression.poiView || expression.viewArea)
                && Number.isFinite(threshold);
            const categoryExcluded = selectedTarget && selectedTarget !== target;
            const visible = configured && !categoryExcluded && zoom >= threshold;
            const label = this.translated(`mapDisplay_target_${target}`, target);
            const reason = !configured
                ? this.translated("mapDisplay_disabled", "設定で非表示です")
                : categoryExcluded
                    ? this.translated("mapDisplay_category", "選択中のカテゴリでは非表示です")
                    : zoom < threshold
                        ? this.format(this.translated("mapDisplay_zoom", "ズーム {zoom} 以上で表示します"), { zoom: threshold })
                        : this.translated("mapDisplay_visible", "この縮尺で表示対象です");
            const button = document.createElement("button");
            button.type = "button";
            button.className = "map-display-target";
            button.dataset.visible = String(visible);
            button.dataset.reason = `${label}：${reason}`;
            button.textContent = label;
            button.title = button.dataset.reason;
            button.setAttribute("aria-label", button.dataset.reason);
            return button;
        }));
    }

    format(template, values = {}) {
        return Object.entries(values).reduce(
            (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
            String(template ?? "")
        );
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;
        // Shared list controls and personal filters remain available without area search.
        const panel = document.getElementById("poiFilterModal");
        if (panel) this.modal = bootstrap.Modal.getOrCreateInstance(panel);
        document.getElementById("poiFilterForm")?.addEventListener("input", () => this.updatePreviewCount());
        document.getElementById("poiFilterForm")?.addEventListener("change", () => this.updatePreviewCount());
        document.getElementById("poiFilterPersonal")?.addEventListener("change", () => this.updatePreviewCount());
        document.getElementById("mapDisplayTargets")?.addEventListener("click", event => {
            const button = event.target.closest(".map-display-target");
            if (!button) return;
            const panel = document.getElementById("mapDisplayReason");
            const message = document.getElementById("mapDisplayReasonText");
            if (!panel || !message) return;
            const alreadyOpen = !panel.hidden && message.textContent === button.dataset.reason;
            message.textContent = button.dataset.reason;
            panel.hidden = alreadyOpen;
        });
        this.localizeUi();
    }

    renderAttributeOptions() {
        const area = document.getElementById("poiFilterAttributes");
        if (!area) return;
        this.attributes.forEach(value => {
            let input = [...area.querySelectorAll('input[name="attributes"]')]
                .find(candidate => candidate.value === value);
            if (!input) {
                const item = document.createElement("label");
                item.className = "area-feature-check";
                input = document.createElement("input");
                input.type = "checkbox";
                input.name = "attributes";
                input.value = value;
                item.append(input, document.createTextNode(""));
                area.appendChild(item);
            }
            input.parentElement.lastChild.textContent = this.attributeLabel(value);
        });
    }

    rebuildRecords() {
        const records = this.linker.rebuildIndex();
        if (this.activeCriteria && !this.usesSearchApi()) {
            this.activeAreaIds = new Set(this.matchingRecords(this.activeCriteria).map(record => record.areaId));
        }
        return records;
    }

    visibleRecords() {
        let bounds;
        try { bounds = mapLibre.get_LL(); } catch (_) { bounds = null; }
        return bounds
            ? this.linker.records.filter(record => geoCont.checkFeatureInner(record.feature, [record.lng, record.lat], bounds))
            : this.linker.records;
    }

    matches(record, criteria) {
        if (criteria.researchMode) {
            if (criteria.researchMode === "missing") return !record.hasDetail;
            if (criteria.researchMode === "stale") return record.hasDetail && !record.isRecent;
            if (criteria.researchMode === "photo") return !record.hasPhoto;
            if (criteria.researchMode === "sparse") {
                return record.informationCount < Number(this.settings.sparseInformationCount ?? 2);
            }
        }
        if (record.score < (criteria.scoreMin ?? 0)) return false;
        if (criteria.recentOnly && !record.isRecent) return false;
        if (criteria.photoOnly && !record.hasPhoto) return false;
        if (criteria.detailOnly && !record.hasDetail) return false;
        const selected = criteria.attributes ?? [];
        if (selected.length) {
            const count = selected.filter(attribute => record.attributes.includes(attribute)).length;
            if (criteria.matchMode === "or" ? count === 0 : count !== selected.length) return false;
        }
        return true;
    }

    matchingRecords(criteria) {
        return this.visibleRecords().filter(record => this.matches(record, criteria));
    }

    readForm() {
        const form = document.getElementById("poiFilterForm");
        if (!form) return { scoreMin: 0, attributes: [], matchMode: "and" };
        const data = new FormData(form);
        return {
            scoreMin: Number(data.get("scoreMin") ?? 0),
            attributes: data.getAll("attributes"),
            matchMode: String(data.get("matchMode") ?? "and"),
            recentOnly: data.has("recentOnly"),
            photoOnly: data.has("photoOnly"),
            detailOnly: data.has("detailOnly")
        };
    }

    async updatePreviewCount() {
        const revision = ++this.previewRevision;
        clearTimeout(this.previewTimer);
        this.previewAbort?.abort();
        const node = document.getElementById("poiFilterPreviewCount");
        this.rebuildRecords();
        const visitState = document.querySelector('input[name="poiFilterVisitState"]:checked')?.value || "off";
        const displayMode = typeof listTable !== "undefined" ? listTable.displayMode : "nearby";
        const count = this.matchingRecords(this.readForm()).filter(record => {
            const status = typeof poiStatusCont !== "undefined" ? poiStatusCont.getRecord(record.areaId) : {};
            return (visitState === "off" || (visitState === "visited" ? status.visited : !status.visited))
                && (displayMode !== "favorite" || status.favorite);
        }).length;
        if (node) node.textContent = this.format(this.translated("placeFilter_loadedCount", "読み込み済み：{count}件"), { count });
    }

    setForm(criteria) {
        const form = document.getElementById("poiFilterForm");
        if (!form) return;
        form.reset();
        form.elements.scoreMin.value = String(criteria.scoreMin ?? 0);
        form.elements.matchMode.value = criteria.matchMode ?? "and";
        [...form.querySelectorAll('[name="attributes"]')].forEach(input => {
            input.checked = (criteria.attributes ?? []).includes(input.value);
        });
        form.elements.recentOnly.checked = Boolean(criteria.recentOnly);
        form.elements.photoOnly.checked = Boolean(criteria.photoOnly);
        form.elements.detailOnly.checked = Boolean(criteria.detailOnly);
        this.updatePreviewCount();
    }

    presetCriteria(name) {
        const definition = this.presetDefinitions[name] ?? {};
        const { icon: _icon, ...criteria } = definition;
        return { scoreMin: 0, attributes: [], matchMode: "and", ...criteria };
    }

    applyPreset(name) {
        const criteria = this.presetCriteria(name);
        criteria.preset = name;
        this.setForm(criteria);
        this.apply(criteria, { localOnly: true });
    }

    applyLocalPreset(name) {
        const criteria = { ...this.presetCriteria(name), preset: name };
        this.setForm(criteria);
        return this.apply(criteria, { localOnly: true });
    }

    draftCriteria() {
        const criteria = this.readForm();
        const previous = this.activeCriteria;
        const visitState = document.querySelector('input[name="poiFilterVisitState"]:checked')?.value || "off";
        const keys = ["scoreMin", "matchMode", "recentOnly", "photoOnly", "detailOnly"];
        if (previous?.preset && visitState === (this.draftVisitState || "off") && keys.every(key => (criteria[key] || false) === (previous[key] || false))
            && JSON.stringify([...(criteria.attributes || [])].sort()) === JSON.stringify([...(previous.attributes || [])].sort())) {
            criteria.preset = previous.preset;
        } else criteria.custom = true;
        return criteria;
    }

    applyPersonalDraft() {
        const selected = document.querySelector('input[name="poiFilterVisitState"]:checked');
        if (selected && Conf.etc?.localSave) cMapMaker.visitedFilterStatus = selected.value;
        // Favorites are selected exclusively by the list view selector.
        cMapMaker.favoriteFilter = false;
    }

    applyFromForm() {
        const criteria = this.draftCriteria();
        this.applyPersonalDraft();
        if (this.settings.use === false) {
            cMapMaker.refreshLocalFilters();
            this.close();
            cMapMaker.changeMode("list");
            return;
        }
        return this.apply(criteria, { localOnly: true });
    }

    searchFromForm() {
        if (Conf.activity?.authMode !== "basic" || this.searchBbox() === null) return;
        const criteria = this.draftCriteria();
        this.applyPersonalDraft();
        return this.apply(criteria, { remoteSearch: true });
    }

    resetDraft() {
        this.setForm({});
        document.querySelectorAll('input[name="poiFilterVisitState"]').forEach(input => { input.checked = input.value === "off"; });
    }
    applyResearch(mode) { this.apply({ researchMode: mode, scoreMin: 0, attributes: [], matchMode: "and" }, { localOnly: true }); }
    applyRating(scoreMin) {
        const minimum = Number(scoreMin) || 0;
        if (minimum <= 0) {
            this.clear();
            this.close();
            cMapMaker.changeMode("list");
            return;
        }
        this.apply({ scoreMin: minimum, attributes: [], matchMode: "and", ratingQuick: true, custom: true }, { localOnly: true });
    }

    async apply(criteria, { localOnly = true, remoteSearch = false } = {}) {
        this.localOnly = remoteSearch ? false : localOnly;
        this.remoteSearch = remoteSearch;
        this.rebuildRecords();
        this.activeCriteria = { ...criteria };
        this.activeAreaIds = new Set();
        this.updateRatingActionLabel(criteria.scoreMin);
        listTable.setViewBinding("areaSearch");
        listTable.setAreaFilter(true);
        const pending = this.syncSearch({ request: true });
        const revision = this.searchRevision;
        this.refreshVisibleResults();
        this.close();
        cMapMaker.changeMode("list");
        await pending;
        if (revision !== this.searchRevision) return;
        this.refreshVisibleResults();
        this.renderSummary();
    }

    reapplyCurrentView() {
        if (this.activeCriteria) {
            this.rebuildRecords();
            this.refreshVisibleResults();
            this.renderSummary();
        }
    }

    clear() {
        this.localOnly = false;
        this.remoteSearch = false;
        ++this.searchRevision;
        this.searchAbort?.abort();
        this.apiRecords = [];
        this.apiState = "";
        this.activeCriteria = null;
        this.activeAreaIds.clear();
        this.updateRatingActionLabel(0);
        listTable.setAreaFilter(false);
        listTable.setViewBinding("default");
        this.refreshVisibleResults();
        const summary = document.getElementById("areaFeatureSummary");
        if (summary) summary.hidden = true;
        this.renderDisplayStatus();
        this.updateListTitle();
    }

    refreshVisibleResults() {
        listTable.makeList();
        listTable.filterByPoiStatus(cMapMaker.visitedFilterStatus, cMapMaker.favoriteFilter);
        cMapMaker.makeImages(Conf.thumbnail.use);
        cMapMaker.viewPoi(listTable.getSelCategory());
    }

    shouldIncludeListRow(rowId) {
        if (!this.activeCriteria) return true;
        const activity = poiCont.get_actid(rowId);
        const sourceId = String(activity?.osmid ?? rowId);
        if (this.usesSearchApi()) return this.activeAreaIds.has(sourceId);
        const areaId = this.linker.resolveAreaId(sourceId);
        if (!this.activeAreaIds.has(areaId)) return false;
        return sourceId === areaId || !this.linker.isAreaId(areaId);
    }

    decorateListItem(item, rowId) {
        if (this.activeCriteria && this.usesSearchApi()) {
            const record = this.apiRecords.find(record => record.areaId === rowId);
            if (record) {
                const facts = document.createElement("div");
                facts.textContent = [record.score ? `★${record.score}` : "",
                    ...record.attributes.map(code => this.attributeLabel(code))].filter(Boolean).join("・");
                item.appendChild(facts);
            }
        }
        if (!this.activeCriteria?.researchMode) return;
        const activity = poiCont.get_actid(rowId);
        const record = this.usesSearchApi()
            ? this.apiRecords.find(record => record.areaId === rowId)
            : this.linker.getAreaRecord(activity?.osmid ?? rowId);
        if (!record) return;
        const status = !record.hasDetail ? "missing" : (!record.isRecent ? "stale" : "recent");
        item.dataset.areaStatus = status;
        const badge = document.createElement("span");
        badge.className = `area-status-badge area-status-${status}`;
        badge.textContent = this.label(`status.${status}`, status);
        item.prepend(badge);
    }

    criteriaLabels(criteria = this.activeCriteria) {
        if (!criteria) return [];
        if (criteria.researchMode) {
            return [
                this.label("criteria.researchMode"),
                this.label(`research.${criteria.researchMode}`, criteria.researchMode)
            ].filter(Boolean);
        }
        const labels = [];
        if (criteria.preset) labels.push(String(this.presetLabel(criteria.preset)));
        if (criteria.scoreMin) {
            labels.push(this.format(this.label("criteria.scoreMinimum", "{score}"), { score: criteria.scoreMin }));
        }
        criteria.attributes?.forEach(attribute => labels.push(this.attributeLabel(attribute)));
        if (criteria.attributes?.length > 1) {
            labels.push(this.label(criteria.matchMode === "or" ? "criteria.matchAny" : "criteria.matchAll"));
        }
        if (criteria.recentOnly) labels.push(this.label("criteria.recent"));
        if (criteria.photoOnly) labels.push(this.label("criteria.photo"));
        if (criteria.detailOnly) labels.push(this.label("criteria.detail"));
        const visibleLabels = labels.filter(Boolean);
        return visibleLabels.length ? visibleLabels : [this.label("criteria.allAreas")];
    }

    renderSummary() {
        this.renderDisplayStatus();
        const summary = document.getElementById("areaFeatureSummary");
        const chips = document.getElementById("areaFeatureChips");
        if (this.localOnly) {
            if (summary) summary.hidden = true;
            this.updateListTitle();
            return;
        }
        if (!summary || !chips || !this.activeCriteria) return;
        chips.replaceChildren();
        this.criteriaLabels().forEach(label => {
            const chip = document.createElement("span");
            chip.className = "area-feature-chip";
            chip.textContent = label;
            chips.appendChild(chip);
        });
        if (this.usesSearchApi()) {
            const notice = document.createElement("span");
            const stateKey = this.apiState === "ready"
                ? this.searchBbox() === null ? "api.noBbox" : "api.bbox"
                : `api.${this.apiState || "loading"}`;
            notice.textContent = this.label(stateKey);
            chips.appendChild(notice);
        }
        const count = document.getElementById("areaFeatureResultCount");
        if (count) count.textContent = this.format(this.label("count", "{count}"), { count: this.activeAreaIds.size });
        summary.hidden = false;
        this.updateListTitle();
    }

    updateListTitle() {
        const title = document.getElementById("listTitle");
        if (!title) return;
        if (this.activeCriteria?.researchMode) {
            title.textContent = this.label(
                `listTitles.${this.activeCriteria.researchMode}`,
                this.label("listTitles.research")
            );
        } else if (this.activeCriteria && !this.localOnly) {
            title.textContent = this.label("listTitles.search");
        } else {
            title.textContent = glot.get("listTitle");
        }
    }

    getAreaZoom(fallback = 0) {
        const zooms = this.linker.configuredTargets("areaTargets")
            .map(target => Number(cMapMaker.getPoiZoom?.(target) ?? Conf?.poiView?.poiZoom?.[target]))
            .filter(Number.isFinite);
        return zooms.length ? Math.min(...zooms) : fallback;
    }

    open(mode = "search") {
        this.rebuildRecords();
        this.localizeUi();
        const panel = document.getElementById("poiFilterModal");
        const search = document.getElementById("poiFilterSearchContent");
        const research = document.getElementById("poiFilterResearchContent");
        const rating = document.getElementById("poiFilterRatingContent");
        if (!panel || !search || !research || (mode === "rating" && !rating)) return;
        search.hidden = mode !== "search" || this.settings.use === false;
        research.hidden = mode !== "research";
        if (rating) rating.hidden = mode !== "rating";
        const actions = document.getElementById("poiFilterActions");
        if (actions) actions.hidden = mode !== "search" || (this.settings.use === false && !Conf.etc?.localSave);
        const heading = document.getElementById("poiFilterTitle");
        if (heading) heading.textContent = mode === "search"
            ? this.translated("placeFilter_title", "詳しい条件")
            : this.label(`heading.${mode}`, this.label("heading.search"));
        const personal = document.getElementById("poiFilterPersonal");
        if (personal) personal.hidden = mode !== "search" || !Conf.etc?.localSave;
        this.draftVisitState = cMapMaker.visitedFilterStatus || "off";
        document.querySelectorAll('input[name="poiFilterVisitState"]').forEach(input => {
            input.checked = input.value === this.draftVisitState;
        });
        if (mode === "search") this.setForm(this.activeCriteria || {});
        const context = document.getElementById("placeCriteriaContext");
        if (context) {
            context.hidden = !this.activeCriteria;
            context.textContent = this.activeCriteria?.preset
                ? this.presetLabel(this.activeCriteria.preset) : this.translated("placeFilter_custom", "カスタム条件");
        }
        const searchButton = document.getElementById("placeCriteriaSearch");
        if (searchButton) searchButton.hidden = mode !== "search" || Conf.activity?.authMode !== "basic" || this.searchBbox() === null;
        const zoomNotice = document.getElementById("poiFilterZoomNotice");
        if (zoomNotice) zoomNotice.hidden = mode === "research" || this.usesSearchApi() || this.linker.records.length > 0 || mapLibre.getZoom(false) >= this.getAreaZoom();
        this.modal = bootstrap.Modal.getOrCreateInstance(panel);
        this.modal.show();
        if (mode === "search" && this.settings.use !== false) this.updatePreviewCount();
    }

    updateRatingActionLabel(scoreMin) {
        const minimum = Number(scoreMin) || 0;
        const select = document.getElementById("listRatingFilter");
        if (select) select.value = String(minimum);
        const label = minimum > 0
            ? this.format(this.label("rating.minimum", "{score}"), { score: minimum })
            : this.label("rating.default");
        const title = minimum > 0
            ? this.format(this.label("rating.activeTitle", "{label}"), { label })
            : label;
        window.listActions?.setLabel(this.settings.ratingActionId ?? "area-rating", label, title);
    }

    close() {
        const panel = document.getElementById("poiFilterModal");
        if (!panel) return;
        this.modal = bootstrap.Modal.getOrCreateInstance(panel);
        this.modal.hide();
    }

    zoomForSearch() {
        const areaZoom = this.getAreaZoom(13);
        this.close();
        mapLibre.setZoom(areaZoom);
        setTimeout(() => cMapMaker.updateView().then(() => this.open("search")), 900);
    }

    matchReasonHtml(osmid) {
        if (!this.activeCriteria) return "";
        const record = this.usesSearchApi()
            ? this.apiRecords.find(record => record.areaId === osmid)
            : this.linker.getAreaRecord(osmid);
        if (!record || !this.activeAreaIds.has(record.areaId)) return "";
        const labels = this.criteriaLabels().map(label => basic.htmlspecialchars(label));
        const facts = [];
        if (record.score) facts.push(this.format(this.label("facts.score", "{score}"), { score: record.score }));
        record.attributes.forEach(attribute => facts.push(this.attributeLabel(attribute)));
        if (record.isRecent) facts.push(this.label("facts.recent"));
        if (record.hasPhoto) facts.push(this.label("facts.photo"));
        const title = basic.htmlspecialchars(this.label("matchReason.title"));
        const registered = basic.htmlspecialchars(this.label("matchReason.registered"));
        const empty = basic.htmlspecialchars(this.label("matchReason.empty"));
        const factHtml = facts.length
            ? `<p class="mb-0"><strong>${registered}</strong> ${facts.map(value => basic.htmlspecialchars(value)).join("・")}</p>`
            : `<p class="mb-0">${empty}</p>`;
        return `<section class="area-match-reason"><h3>${title}</h3><p>${labels.join("・")}</p>${factHtml}</section>`;
    }
}
