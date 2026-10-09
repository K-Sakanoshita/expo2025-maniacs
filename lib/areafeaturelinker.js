"use strict";

// Parent areas and the features contained by them are normalized into one record per area.
class AreaFeatureLinker {
    constructor() {
        this.records = [];
        this.recordByAreaId = new Map();
        this.areaIdByFeatureId = new Map();
        this.sourceKey = "";
    }

    get settings() {
        return Conf?.areaFeatureLinker ?? {};
    }

    configuredTargets(key) {
        const targets = this.settings[key];
        if (Array.isArray(targets)) return targets.map(String).filter(Boolean);
        return targets == null || targets === "" ? [] : [String(targets)];
    }

    hasConfiguredTarget(targets, key) {
        const configured = new Set(this.configuredTargets(key));
        return configured.size > 0 && (targets ?? []).some(target => configured.has(String(target)));
    }

    activityField(key, fallback) {
        return String(this.settings.activityFields?.[key] ?? fallback);
    }

    parseDate(value) {
        if (!value) return null;
        const time = Date.parse(value);
        return Number.isFinite(time) ? time : null;
    }

    activityTime(activity) {
        const fields = this.settings.activityDateFields ?? ["actdate", "updatetime"];
        for (const field of fields) {
            const time = this.parseDate(activity?.[field]);
            if (time !== null) return time;
        }
        return 0;
    }

    latestActivity(activities) {
        return [...activities].sort((left, right) => {
            const fields = this.settings.activityDateFields ?? ["actdate", "updatetime"];
            for (const field of fields) {
                const dateDiff = (this.parseDate(right?.[field]) ?? 0) - (this.parseDate(left?.[field]) ?? 0);
                if (dateDiff !== 0) return dateDiff;
            }
            return String(right?.id ?? "").localeCompare(String(left?.id ?? ""));
        })[0];
    }

    scoreOf(value) {
        const pattern = String(this.settings.scoreCodePattern ?? "act_score_(\\d+)$");
        let match = null;
        try { match = String(value ?? "").match(new RegExp(pattern)); } catch (_) { match = null; }
        if (match) {
            const offset = Number(this.settings.scoreCodeOffset ?? 1);
            return Math.max(0, Math.min(5, Number(match[1]) - offset));
        }
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(0, Math.min(5, number)) : 0;
    }

    averageScore(activities) {
        const scoreField = this.activityField("score", "score");
        const scores = activities.map(activity => this.scoreOf(activity?.[scoreField])).filter(score => score > 0);
        if (!scores.length) return 0;
        return Math.round((scores.reduce((total, score) => total + score, 0) / scores.length) * 10) / 10;
    }

    photoOf(activity) {
        const pattern = String(this.settings.photoFieldPattern ?? "^picture_url\\d+$");
        let expression;
        try { expression = new RegExp(pattern); } catch (_) { return false; }
        return Object.keys(activity ?? {}).some(key => expression.test(key) && String(activity[key] ?? "").trim() !== "");
    }

    isAreaId(osmid) {
        return this.hasConfiguredTarget(poiCont.get_osmid(osmid)?.targets, "areaTargets");
    }

    findContainingAreaId(osmid) {
        let current = String(osmid ?? "");
        const seen = new Set([current]);
        const maxDepth = Math.max(1, Number(this.settings.maxParentDepth ?? 8));
        for (let depth = 0; current && depth < maxDepth; depth++) {
            const parentId = String(poiCont.get_parent(current)?.properties?.id ?? "");
            if (!parentId || seen.has(parentId)) break;
            if (this.isAreaId(parentId)) return parentId;
            seen.add(parentId);
            current = parentId;
        }
        return "";
    }

    resolveAreaId(osmid) {
        const id = String(osmid ?? "");
        if (!id) return "";
        if (this.areaIdByFeatureId.has(id)) return this.areaIdByFeatureId.get(id);
        if (this.isAreaId(id)) return id;
        return this.findContainingAreaId(id) || id;
    }

    shouldLinkFeature(targets) {
        const configured = this.configuredTargets("featureTargets");
        return configured.length === 0 || this.hasConfiguredTarget(targets, "featureTargets");
    }

    rebuildIndex(force = false) {
        const sourceKey = `${poiCont.revision ?? 0}:${glot.lang ?? ""}`;
        if (!force && this.sourceKey === sourceKey) return this.records;
        if (this.settings.use === false) {
            this.records = [];
            this.recordByAreaId = new Map();
            this.areaIdByFeatureId = new Map();
            this.sourceKey = sourceKey;
            return this.records;
        }
        const areas = new Map();
        this.areaIdByFeatureId = new Map();
        const pois = poiCont.pois()?.pois ?? { geojson: [], targets: [] };

        pois.geojson.forEach((feature, index) => {
            const areaId = String(feature?.properties?.id ?? feature?.id ?? "");
            const targets = pois.targets[index] ?? [];
            if (!areaId || !this.hasConfiguredTarget(targets, "areaTargets")) return;
            this.areaIdByFeatureId.set(areaId, areaId);
            areas.set(areaId, {
                areaId,
                feature,
                lnglat: poiCont.get_osmid(areaId)?.lnglat,
                linkedFeatures: [],
                activities: []
            });
        });

        pois.geojson.forEach((feature, index) => {
            const featureId = String(feature?.properties?.id ?? feature?.id ?? "");
            if (!featureId) return;
            const targets = pois.targets[index] ?? [];
            const areaId = this.isAreaId(featureId) ? featureId : this.findContainingAreaId(featureId);
            this.areaIdByFeatureId.set(featureId, areaId || featureId);
            if (!areaId || areaId === featureId || !areas.has(areaId) || !this.shouldLinkFeature(targets)) return;
            areas.get(areaId).linkedFeatures.push({
                featureId,
                feature,
                targets: [...targets],
                lnglat: poiCont.get_osmid(featureId)?.lnglat
            });
        });

        (poiCont.pois()?.acts ?? []).forEach(activity => {
            const sourceId = String(activity?.osmid ?? "");
            if (!sourceId || !poiCont.get_osmid(sourceId)) return;
            const areaId = this.resolveAreaId(sourceId);
            this.areaIdByFeatureId.set(sourceId, areaId);
            if (!areas.has(areaId)) {
                if (this.settings.includeUnlinkedActivities !== true) return;
                const osm = poiCont.get_osmid(areaId) ?? poiCont.get_osmid(sourceId);
                if (!osm) return;
                areas.set(areaId, {
                    areaId,
                    feature: osm.geojson,
                    lnglat: osm.lnglat,
                    linkedFeatures: [],
                    activities: []
                });
            }
            areas.get(areaId).activities.push(activity);
        });

        const recentDays = Number(this.settings.recentDays ?? 365);
        const recentLimit = Date.now() - recentDays * 86400000;
        const attributeField = this.activityField("attributes", "good_points");
        const bodyField = this.activityField("body", "body");
        const detailUrlField = this.activityField("detailUrl", "detail_url");

        this.records = [...areas.values()].map(source => {
            const activities = source.activities;
            const activity = activities.length ? this.latestActivity(activities) : null;
            const attributes = [...new Set(activities.flatMap(item =>
                String(item?.[attributeField] ?? "").split(",").map(value => value.trim()).filter(Boolean)
            ))];
            const score = this.averageScore(activities);
            const hasPhoto = activities.some(item => this.photoOf(item));
            const memo = activities.map(item => String(item?.[bodyField] ?? "").trim()).find(Boolean) ?? "";
            const hasDetailUrl = activities.some(item => String(item?.[detailUrlField] ?? "").trim() !== "");
            const hasDetail = Boolean(score || attributes.length || hasPhoto || memo || hasDetailUrl);
            const confirmedTime = activity ? this.activityTime(activity) : 0;
            const tags = source.feature?.properties ?? {};
            const category = poiCont.getCatnames(tags);
            const name = poiCont.getOSMname(tags, glot.lang)
                || activity?.title
                || category[1]
                || category[0]
                || "";
            const informationCount = Number(score > 0) + attributes.length + Number(hasPhoto)
                + Number(Boolean(memo)) + Number(hasDetailUrl);
            return {
                areaId: source.areaId,
                name,
                feature: source.feature,
                linkedFeatures: source.linkedFeatures,
                activities,
                lng: source.lnglat?.[0],
                lat: source.lnglat?.[1],
                score,
                attributes,
                confirmed: confirmedTime ? new Date(confirmedTime).toISOString() : "",
                hasPhoto,
                hasDetail,
                memo,
                activityId: activity?.id ?? "",
                isRecent: confirmedTime >= recentLimit,
                informationCount
            };
        });
        this.recordByAreaId = new Map(this.records.map(record => [record.areaId, record]));
        this.sourceKey = sourceKey;
        return this.records;
    }

    getAreaRecord(osmid) {
        return this.recordByAreaId.get(this.resolveAreaId(osmid));
    }

    getLinkedFeatures(osmid, targets = null) {
        const features = this.getAreaRecord(osmid)?.linkedFeatures ?? [];
        const targetList = Array.isArray(targets) ? targets : (targets ? [targets] : []);
        if (!targetList.length) return [...features];
        const expected = new Set(targetList.map(String));
        return features.filter(item => item.targets.some(target => expected.has(String(target))));
    }
}
