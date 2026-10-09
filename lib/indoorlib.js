"use strict";

// Indoor mode state, building selection, level UI, and visibility control.
class IndoorControl {
    constructor() {
        this.indoorLevel = null;
        this.indoorLevelControlElement = null;
        this.indoorLevelCandidate = null;
        this.indoorLevelWheelTimer = null;
        this.indoorLevelWheelIgnoreScroll = false;
        this.indoorContextKey = null;
        this.indoorBuildingId = null;
        this.indoorBuildingFeature = null;
        this.indoorBuildingIds = new Set();
        this.indoorBuildingFeatures = [];
        this.indoorBuildingLevelRanges = new Map();
        this.indoorUndergroundMode = false;
        this.indoorRenderMinZoom = null;
        this.levelModeActive = false;
        this.indoorModeActive = false;
        this.pendingInitialIndoorLevel = null;
    }

    initIndoorControl(urlLevel) {
        if (!Conf.indoor?.use) return;

        const configuredLevels = Conf.indoor.levels?.order ?? [];
        const urlLevelValue = urlLevel == null || String(urlLevel) === ""
            ? null : String(urlLevel);
        this.pendingInitialIndoorLevel = urlLevelValue;
        const initialLevel = String(urlLevelValue ?? Conf.indoor.defaultLevel ?? configuredLevels[0] ?? "0");
        this.indoorLevel = initialLevel;

        if (!Conf.indoor.control?.view) return;
        const label = Conf.indoor.control.label ?? "Floor";
        const control = document.createElement("div");
        control.id = "indoorLevelControl";
        control.className = "indoor-level-control";
        control.setAttribute("role", "group");
        control.setAttribute("aria-label", label);
        control.addEventListener("click", event => {
            const button = event.target.closest("button[data-level]");
            if (!button || button.disabled) return;
            cMapMaker.selectIndoorLevelOption(button.dataset.level);
        });
        control.addEventListener("wheel", event => event.stopPropagation(), { passive: true });
        control.addEventListener("scroll", event => {
            if (event.target.matches?.("[data-level-wheel]")) {
                cMapMaker.queueIndoorLevelWheelSelection(event.target);
            }
        }, true);
        control.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                const option = event.target.closest?.("button[data-level]:not(:disabled)");
                if (option) {
                    event.preventDefault();
                    cMapMaker.selectIndoorLevelOption(option.dataset.level);
                    return;
                }
                if (event.target.matches?.("[data-level-wheel]")) {
                    event.preventDefault();
                    cMapMaker.confirmIndoorLevelSelection();
                    return;
                }
            }
            const direction = event.key === "ArrowDown" ? 1 : (event.key === "ArrowUp" ? -1 : 0);
            if (direction !== 0) {
                event.preventDefault();
                cMapMaker.moveIndoorLevelSelection(direction);
                return;
            }
            if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                cMapMaker.moveIndoorLevelSelection(event.key === "Home" ? "first" : "last");
            }
        });
        this.indoorLevelControlElement = control;
    }

    getIndoorLargeBuildingActivation() {
        const config = Conf.indoor?.largeBuildingActivation ?? {};
        const configuredMinZoom = Number(config.minZoom);
        const configuredReferenceZoom = Number(config.referenceZoom);
        const configuredCoverageRatio = Number(config.viewportCoverageRatio);
        return {
            use: config.use === true,
            minZoom: Number.isFinite(configuredMinZoom) && configuredMinZoom >= 0
                && configuredMinZoom <= 24 ? configuredMinZoom : 15,
            referenceZoom: Number.isFinite(configuredReferenceZoom) && configuredReferenceZoom >= 0
                && configuredReferenceZoom <= 24 ? configuredReferenceZoom : 18,
            viewportCoverageRatio: Number.isFinite(configuredCoverageRatio) && configuredCoverageRatio > 0
                && configuredCoverageRatio <= 10 ? configuredCoverageRatio : 1,
            groupNearbyBuildings: config.groupNearbyBuildings === true
        };
    }

    normalizeIndoorLevelValue(level) {
        const value = String(level ?? "").trim().toLowerCase();
        if (value === "roof") return value;
        const numericLevel = Number(value);
        return Number.isInteger(numericLevel) && numericLevel >= -100 && numericLevel <= 100
            ? String(numericLevel) : null;
    }

    sortIndoorLevelValues(levels = []) {
        return [...new Set(levels
            .map(level => this.normalizeIndoorLevelValue(level))
            .filter(level => level !== null))]
            .sort((left, right) => left === "roof" ? 1
                : (right === "roof" ? -1 : Number(left) - Number(right)));
    }

    makeIndoorLevelButtons(levels, selectedLevel = this.indoorLevel, availableLevels = levels) {
        const availableLevelSet = new Set((availableLevels ?? []).map(String));
        const entries = this.sortIndoorLevelValues(levels).map(level => ({ level }));
        const selected = entries.find(entry => entry.level === String(selectedLevel)
            && availableLevelSet.has(entry.level))
            ?? entries.find(entry => availableLevelSet.has(entry.level));
        const currentLevel = selected?.level ?? String(selectedLevel);
        const options = entries.map(({ level }) => {
            const label = this.formatIndoorLevel(level);
            const available = availableLevelSet.has(level);
            const isSelected = available && level === currentLevel;
            const unavailableLabel = `${label}（表示対象なし）`;
            return `<button type="button" role="option" class="indoor-level-option${isSelected ? " active" : ""}"`
                + ` data-level="${level}" aria-label="${available ? label : unavailableLabel}"`
                + ` aria-selected="${isSelected}"${available ? "" : " disabled aria-disabled=\"true\""}`
                + ` title="${available ? label : unavailableLabel}">${label}</button>`;
        }).join("");
        return `<div class="indoor-level-picker">`
            + `<div class="indoor-level-popover" data-level-popover>`
            + `<div class="indoor-level-wheel-frame"><div class="indoor-level-wheel" data-level-wheel`
            + ` role="listbox" tabindex="0" aria-label="表示する階の候補">${options}</div></div>`
            + `</div></div>`;
    }

    initializeIndoorLevelPicker() {
        if (!this.indoorLevelControlElement) return;
        this.updateIndoorLevelCandidate(this.indoorLevel);
        requestAnimationFrame(() => this.scrollIndoorLevelIntoView(this.indoorLevelCandidate));
    }

    scrollIndoorLevelIntoView(level = this.indoorLevelCandidate ?? this.indoorLevel) {
        const wheel = this.indoorLevelControlElement?.querySelector("[data-level-wheel]");
        const option = wheel?.querySelector(`button[data-level="${level}"]`);
        if (!wheel || !option) return;
        this.indoorLevelWheelIgnoreScroll = true;
        wheel.scrollTop = option.offsetTop - (wheel.clientHeight - option.offsetHeight) / 2;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this.indoorLevelWheelIgnoreScroll = false;
        }));
    }

    queueIndoorLevelWheelSelection(wheel) {
        if (this.indoorLevelWheelIgnoreScroll) return;
        clearTimeout(this.indoorLevelWheelTimer);
        this.indoorLevelWheelTimer = setTimeout(() => {
            this.updateIndoorLevelCandidateFromWheel(wheel);
        }, 120);
    }

    updateIndoorLevelCandidateFromWheel(wheel) {
        if (!wheel) return;
        const wheelCenter = wheel.getBoundingClientRect().top + wheel.clientHeight / 2;
        const nearest = [...wheel.querySelectorAll("button[data-level]")]
            .map(option => ({
                option,
                distance: Math.abs(option.getBoundingClientRect().top
                    + option.getBoundingClientRect().height / 2 - wheelCenter)
            }))
            .sort((left, right) => left.distance - right.distance)[0]?.option;
        if (nearest) this.updateIndoorLevelCandidate(nearest.dataset.level);
    }

    updateIndoorLevelCandidate(level, scrollIntoView = false) {
        const option = this.indoorLevelControlElement
            ?.querySelector(`button[data-level="${String(level)}"]`);
        if (!option) return;
        this.indoorLevelCandidate = String(level);
        this.indoorLevelControlElement.querySelectorAll("button[data-level]").forEach(button => {
            const candidate = button.dataset.level === this.indoorLevelCandidate;
            button.classList.toggle("pending", candidate);
            button.setAttribute("aria-selected",
                String(button.dataset.level === String(this.indoorLevel)));
        });
        if (scrollIntoView) this.scrollIndoorLevelIntoView(this.indoorLevelCandidate);
    }

    selectIndoorLevelOption(level) {
        const option = this.indoorLevelControlElement
            ?.querySelector(`button[data-level="${String(level)}"]:not(:disabled)`);
        if (!option) return;
        clearTimeout(this.indoorLevelWheelTimer);
        this.updateIndoorLevelCandidate(level, true);
        if (String(level) !== String(this.indoorLevel)) this.setIndoorLevel(level);
    }

    confirmIndoorLevelSelection() {
        if (this.indoorLevelCandidate === null) return;
        clearTimeout(this.indoorLevelWheelTimer);
        const wheel = this.indoorLevelControlElement?.querySelector("[data-level-wheel]");
        this.updateIndoorLevelCandidateFromWheel(wheel);
        const level = this.indoorLevelCandidate;
        const candidate = this.indoorLevelControlElement
            ?.querySelector(`button[data-level="${level}"]:not(:disabled)`);
        if (!candidate) return;
        if (level !== String(this.indoorLevel)) this.setIndoorLevel(level);
    }

    moveIndoorLevelSelection(direction) {
        const options = [...(this.indoorLevelControlElement
            ?.querySelectorAll("button[data-level]:not(:disabled)") ?? [])];
        if (options.length === 0) return;
        const currentLevel = this.indoorLevelCandidate ?? String(this.indoorLevel);
        const currentIndex = Math.max(0,
            options.findIndex(option => option.dataset.level === currentLevel));
        const nextIndex = direction === "first" ? 0
            : (direction === "last" ? options.length - 1
                : Math.max(0, Math.min(options.length - 1, currentIndex + direction)));
        this.updateIndoorLevelCandidate(options[nextIndex].dataset.level, true);
    }

    isIndoorBuildingFeature(feature) {
        const properties = feature?.properties ?? {};
        const tags = properties.tags ?? properties;
        return ["Polygon", "MultiPolygon"].includes(feature?.geometry?.type)
            && (properties.__indoorBuildingSource === "vectorTile" || tags.building !== undefined);
    }

    getIndoorBuildingHighestLevel(feature) {
        const properties = feature?.properties ?? {};
        const tags = properties.tags ?? properties;
        const buildingLevels = Number(tags["building:levels"]);
        if (Number.isInteger(buildingLevels) && buildingLevels > 0 && buildingLevels <= 101) {
            return buildingLevels - 1;
        }

        const heightText = String(tags.height ?? properties.height ?? "").trim();
        const heightMatch = heightText.match(/^(\d+(?:\.\d+)?)\s*m?$/i);
        if (!heightMatch) return null;
        const configuredLevelHeight = Number(Conf.indoor?.buildingLevelHeightMeters);
        const levelHeight = Number.isFinite(configuredLevelHeight) && configuredLevelHeight > 0
            ? configuredLevelHeight : 3.66;
        const inferredFloorCount = Math.round(Number(heightMatch[1]) / levelHeight);
        return inferredFloorCount > 0 && inferredFloorCount <= 101 ? inferredFloorCount - 1 : null;
    }

    isIndoorLayoutFeature(feature, targets = []) {
        if (!(targets ?? []).includes("indoor")) return false;
        if (feature?.geometry?.type === "Point") return false;
        return this.matchesIndoorRenderTags(feature, "line");
    }

    matchesIndoorRenderTags(feature, geometryGroup, target = "indoor") {
        const properties = feature?.properties ?? {};
        const tags = properties.tags ?? properties;
        const configuredTags = Conf.osm?.[target]?.expression?.renderTags?.[geometryGroup];
        if (!configuredTags || typeof configuredTags !== "object") return false;
        return Object.entries(configuredTags).some(([key, configuredValues]) => {
            if (configuredValues === "*") return tags[key] !== undefined;
            const values = Array.isArray(configuredValues) ? configuredValues : [configuredValues];
            return tags[key] !== undefined && values.map(String).includes(String(tags[key]));
        });
    }

    isIndoorRenderableFeature(feature, target = "indoor") {
        const geometryGroup = feature?.geometry?.type === "Point" ? "point" : "line";
        return this.matchesIndoorRenderTags(feature, geometryGroup, target);
    }

    isIndoorPoiVisibleAtZoom(targets, zoom = mapLibre.getZoom(false)) {
        if (!poiCont.isPoiViewVisible(targets)) return false;
        const activeTargets = new Set(poiCont.getTargets());
        return (targets ?? []).some(target => {
            if (!activeTargets.has(target) || Conf.osm?.[target]?.expression?.poiView === false) return false;
            const poiZoom = Number(this.getPoiZoom(target));
            const editZoom = Number(Conf.poiView?.editZoom?.[target]);
            return (Number.isFinite(poiZoom) && zoom >= poiZoom)
                || (Conf.etc?.editMode && Number.isFinite(editZoom) && zoom >= editZoom);
        });
    }

    getLevelFeatureControlContext(features, targetLists = []) {
        if (!mapLibre.map || !Array.isArray(features)) return null;

        const currentZoom = mapLibre.getZoom(false);
        const bounds = mapLibre.map.getBounds();
        const viewBounds = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
        const getBounds = feature => {
            const coordinates = feature?.geometry?.coordinates;
            if (!coordinates) return null;
            const result = [Infinity, Infinity, -Infinity, -Infinity];
            const visit = value => {
                if (Array.isArray(value) && value.length >= 2
                    && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
                    const lng = Number(value[0]), lat = Number(value[1]);
                    result[0] = Math.min(result[0], lng);
                    result[1] = Math.min(result[1], lat);
                    result[2] = Math.max(result[2], lng);
                    result[3] = Math.max(result[3], lat);
                    return;
                }
                if (Array.isArray(value)) value.forEach(visit);
            };
            visit(coordinates);
            return result.every(Number.isFinite) ? result : null;
        };
        const intersectsView = bbox => bbox && bbox[0] <= viewBounds[2] && bbox[2] >= viewBounds[0]
            && bbox[1] <= viewBounds[3] && bbox[3] >= viewBounds[1];
        let hasUnassignedVisiblePoi = false;
        const levelFeatures = features.flatMap((feature, index) => {
            if (this.isIndoorBuildingFeature(feature)) return [];
            const targets = targetLists[index] ?? [];
            const poiVisibleAtZoom = this.isIndoorPoiVisibleAtZoom(targets, currentZoom);
            if (!this.isIndoorLayoutFeature(feature, targets) && !poiVisibleAtZoom) return [];
            // Unspecified POIs belong to 1F only after indoor mode is active.
            // They must not activate floor mode or trigger building intersections
            // for every outdoor shop/amenity in the current view.
            const levels = this.sortIndoorLevelValues(this.getIndoorFeatureLevels(feature));
            if (levels.length === 0) {
                if (poiVisibleAtZoom && intersectsView(getBounds(feature))) hasUnassignedVisiblePoi = true;
                return [];
            }
            const bbox = getBounds(feature);
            return intersectsView(bbox) ? [{
                feature,
                bbox,
                levels,
                targets,
                poiVisibleAtZoom
            }] : [];
        });
        // 部屋・通路だけでは低ズームから階層表示へ入らない。
        // 通常のPOI表示ズームに達したlevel/roof POIを起点とし、屋内地物は選択可能階の補完に使う。
        if (!levelFeatures.some(item => item.poiVisibleAtZoom)) return null;

        // Preserve the 1F fallback after activation without intersecting outdoor POIs.
        const availableLevels = this.sortIndoorLevelValues([
            ...levelFeatures.flatMap(item => item.levels),
            ...(hasUnassignedVisiblePoi ? ["0"] : [])
        ]);
        const numericLevels = availableLevels.map(Number).filter(Number.isInteger);
        let knownHighestLevel = numericLevels.at(-1) ?? -Infinity;
        const buildingHighestLevels = features.flatMap(feature => {
            if (!this.isIndoorBuildingFeature(feature)) return [];
            // Intersections are only needed when a building can extend the floor range.
            // Vector tiles may contain large multipolygons with many unrelated rooms.
            const highestLevel = this.getIndoorBuildingHighestLevel(feature);
            if (!Number.isInteger(highestLevel) || highestLevel <= knownHighestLevel) return [];
            const bbox = getBounds(feature);
            if (!intersectsView(bbox)) return [];
            const relatedToLevelFeature = levelFeatures.some(item => {
                if (item.bbox[0] > bbox[2] || item.bbox[2] < bbox[0]
                    || item.bbox[1] > bbox[3] || item.bbox[3] < bbox[1]) return false;
                try {
                    return turf.booleanIntersects(feature, item.feature);
                } catch (_error) {
                    return true;
                }
            });
            if (!relatedToLevelFeature) return [];
            knownHighestLevel = highestLevel;
            return [highestLevel];
        });
        const lowestLevel = numericLevels[0] ?? 0;
        const highestLevel = Math.max(numericLevels.at(-1) ?? 0, ...buildingHighestLevels);
        const levels = (numericLevels.length > 0 || buildingHighestLevels.length > 0)
            ? Array.from(
                { length: highestLevel - lowestLevel + 1 },
                (_, index) => String(lowestLevel + index)
            ) : [];
        if (availableLevels.includes("roof")) levels.push("roof");
        const anchorBounds = levelFeatures.reduce((combined, item) => [
            Math.min(combined[0], item.bbox[0]), Math.min(combined[1], item.bbox[1]),
            Math.max(combined[2], item.bbox[2]), Math.max(combined[3], item.bbox[3])
        ], [Infinity, Infinity, -Infinity, -Infinity]);
        const horizontalPadding = (viewBounds[2] - viewBounds[0]) * 0.12;
        const verticalPadding = (viewBounds[3] - viewBounds[1]) * 0.08;
        const safeTopPixels = Math.min(112, mapLibre.map.getContainer().clientHeight * 0.25);
        const safeTopLatitude = mapLibre.map.unproject([0, safeTopPixels]).lat;
        const anchor = [
            Math.min(anchorBounds[2], viewBounds[2] - horizontalPadding),
            Math.max(viewBounds[1] + verticalPadding,
                Math.min(anchorBounds[3], viewBounds[3] - verticalPadding, safeTopLatitude))
        ];
        const levelStrings = availableLevels;
        const indoorFeatureMode = levelFeatures.some(item =>
            this.isIndoorLayoutFeature(item.feature, item.targets));
        const contextBoundsKey = anchorBounds.map(value => Number(value).toFixed(5)).join(",");
        return {
            anchor,
            contextKey: `${indoorFeatureMode ? "indoor-layout" : "level-features"}`
                + `:${levelStrings.join(",")}:${highestLevel}:${levelFeatures.length}:${contextBoundsKey}`,
            levels,
            poiLevels: levelStrings,
            availableLevels: levelStrings,
            buildingId: null,
            buildingFeature: null,
            buildingIds: [],
            buildingFeatures: [],
            buildingLevelRanges: [],
            undergroundMode: false,
            largeBuildingMode: false,
            levelFeatureMode: true,
            indoorFeatureMode
        };
    }

    getIndoorControlContext(features, targetLists = [], options = {}) {
        if (!mapLibre.map || !Array.isArray(features)) return null;

        const bounds = mapLibre.map.getBounds();
        const viewBounds = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
        const center = mapLibre.map.getCenter();
        const getBounds = feature => {
            const coordinates = feature?.geometry?.coordinates;
            if (!coordinates) return null;
            const result = [Infinity, Infinity, -Infinity, -Infinity];
            const visit = value => {
                if (Array.isArray(value) && value.length >= 2
                    && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
                    const lng = Number(value[0]), lat = Number(value[1]);
                    result[0] = Math.min(result[0], lng);
                    result[1] = Math.min(result[1], lat);
                    result[2] = Math.max(result[2], lng);
                    result[3] = Math.max(result[3], lat);
                    return;
                }
                if (Array.isArray(value)) value.forEach(visit);
            };
            visit(coordinates);
            return result.every(Number.isFinite) ? result : null;
        };
        const intersectsView = bbox => bbox && bbox[0] <= viewBounds[2] && bbox[2] >= viewBounds[0]
            && bbox[1] <= viewBounds[3] && bbox[3] >= viewBounds[1];
        const centerPoint = turf.point([center.lng, center.lat]);
        const containsCenter = ({ feature, bbox }) => {
            if (!bbox || center.lng < bbox[0] || center.lng > bbox[2]
                || center.lat < bbox[1] || center.lat > bbox[3]) return false;
            try {
                return turf.booleanPointInPolygon(centerPoint, feature);
            } catch (_error) {
                return false;
            }
        };
        const distanceFromCenter = bbox => {
            const lng = (bbox[0] + bbox[2]) / 2;
            const lat = (bbox[1] + bbox[3]) / 2;
            const lngScale = Math.cos(center.lat * Math.PI / 180);
            return Math.hypot((lng - center.lng) * lngScale, lat - center.lat);
        };
        const distanceToFeatureMeters = feature => {
            if (!feature?.geometry?.coordinates) return Infinity;
            if (["Polygon", "MultiPolygon"].includes(feature.geometry.type)) {
                try {
                    if (turf.booleanPointInPolygon(centerPoint, feature)) return 0;
                } catch (_error) {
                    // 壊れた形状は座標列からの距離計算へフォールバックする。
                }
            }

            const metersPerDegreeLat = 111320;
            const metersPerDegreeLng = metersPerDegreeLat * Math.cos(center.lat * Math.PI / 180);
            let minimum = Infinity;
            const isCoordinate = value => Array.isArray(value) && value.length >= 2
                && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));
            const project = coordinate => [
                (Number(coordinate[0]) - center.lng) * metersPerDegreeLng,
                (Number(coordinate[1]) - center.lat) * metersPerDegreeLat
            ];
            const visit = value => {
                if (isCoordinate(value)) {
                    const [x, y] = project(value);
                    minimum = Math.min(minimum, Math.hypot(x, y));
                    return;
                }
                if (!Array.isArray(value)) return;
                if (value.length > 0 && value.every(isCoordinate)) {
                    const points = value.map(project);
                    points.forEach(([x, y]) => { minimum = Math.min(minimum, Math.hypot(x, y)); });
                    for (let index = 1; index < points.length; index++) {
                        const [ax, ay] = points[index - 1];
                        const [bx, by] = points[index];
                        const dx = bx - ax, dy = by - ay;
                        const lengthSquared = dx * dx + dy * dy;
                        const ratio = lengthSquared === 0 ? 0
                            : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
                        minimum = Math.min(minimum, Math.hypot(ax + ratio * dx, ay + ratio * dy));
                    }
                    return;
                }
                value.forEach(visit);
            };
            visit(feature.geometry.coordinates);
            return minimum;
        };
        const bboxDistanceMeters = (left, right) => {
            const lngGap = Math.max(0, left[0] - right[2], right[0] - left[2]);
            const latGap = Math.max(0, left[1] - right[3], right[1] - left[3]);
            const metersPerDegreeLat = 111320;
            const metersPerDegreeLng = metersPerDegreeLat * Math.cos(center.lat * Math.PI / 180);
            return Math.hypot(lngGap * metersPerDegreeLng, latGap * metersPerDegreeLat);
        };
        const getGeometryLines = feature => {
            if (feature?.geometry?.type === "Polygon") return feature.geometry.coordinates ?? [];
            if (feature?.geometry?.type === "MultiPolygon") return (feature.geometry.coordinates ?? []).flat();
            return [];
        };
        const distanceBetweenFeaturesMeters = (left, right) => {
            try {
                if (turf.booleanIntersects(left, right)) return 0;
            } catch (_error) {
                // 壊れた形状は輪郭座標間の距離計算へフォールバックする。
            }
            const metersPerDegreeLat = 111320;
            const metersPerDegreeLng = metersPerDegreeLat * Math.cos(center.lat * Math.PI / 180);
            const project = coordinate => [
                (Number(coordinate[0]) - center.lng) * metersPerDegreeLng,
                (Number(coordinate[1]) - center.lat) * metersPerDegreeLat
            ];
            const pointToSegment = (point, start, end) => {
                const dx = end[0] - start[0], dy = end[1] - start[1];
                const lengthSquared = dx * dx + dy * dy;
                const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
                    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
                return Math.hypot(point[0] - (start[0] + ratio * dx),
                    point[1] - (start[1] + ratio * dy));
            };
            const leftLines = getGeometryLines(left).map(line => line.map(project));
            const rightLines = getGeometryLines(right).map(line => line.map(project));
            let minimum = Infinity;
            leftLines.forEach(leftLine => {
                rightLines.forEach(rightLine => {
                    for (let leftIndex = 1; leftIndex < leftLine.length; leftIndex++) {
                        for (let rightIndex = 1; rightIndex < rightLine.length; rightIndex++) {
                            const leftStart = leftLine[leftIndex - 1], leftEnd = leftLine[leftIndex];
                            const rightStart = rightLine[rightIndex - 1], rightEnd = rightLine[rightIndex];
                            minimum = Math.min(minimum,
                                pointToSegment(leftStart, rightStart, rightEnd),
                                pointToSegment(leftEnd, rightStart, rightEnd),
                                pointToSegment(rightStart, leftStart, leftEnd),
                                pointToSegment(rightEnd, leftStart, leftEnd));
                        }
                    }
                });
            });
            return minimum;
        };

        const buildings = features.flatMap((feature, index) => {
            if (!this.isIndoorBuildingFeature(feature)) return [];
            const bbox = getBounds(feature);
            return intersectsView(bbox) ? [{
                feature,
                bbox,
                targets: targetLists[index] ?? [],
                index
            }] : [];
        });
        const largeBuildingOnly = options.largeBuildingOnly === true;
        const largeBuildingActivation = options.largeBuildingActivation
            ?? this.getIndoorLargeBuildingActivation();
        const currentZoom = mapLibre.getZoom(false);
        const referenceScale = Math.pow(2,
            largeBuildingActivation.referenceZoom - currentZoom);
        const referenceViewWidth = (viewBounds[2] - viewBounds[0]) / referenceScale;
        const referenceViewHeight = (viewBounds[3] - viewBounds[1]) / referenceScale;
        const isLargeAtReferenceZoom = ({ bbox }) => bbox
            && ((bbox[2] - bbox[0]) >= referenceViewWidth
                * largeBuildingActivation.viewportCoverageRatio
                || (bbox[3] - bbox[1]) >= referenceViewHeight
                * largeBuildingActivation.viewportCoverageRatio);
        const buildingCandidates = largeBuildingOnly
            ? buildings.filter(isLargeAtReferenceZoom) : buildings;
        if (largeBuildingOnly && buildingCandidates.length === 0) return null;

        // 低ズームの大型建物判定では、建物サイズが条件を満たしてから屋内POIを走査する。
        const visibleIndoor = features.flatMap((feature, index) => {
            if (this.isIndoorBuildingFeature(feature)) return [];
            const bbox = getBounds(feature);
            return intersectsView(bbox) ? [{
                feature,
                bbox,
                targets: targetLists[index] ?? [],
                index
            }] : [];
        });
        const buildingGroup = Conf.indoor?.buildingGroup ?? {};
        const configuredSmallArea = Number(buildingGroup.smallBuildingAreaSquareMeters);
        const smallBuildingArea = Number.isFinite(configuredSmallArea) && configuredSmallArea > 0
            ? configuredSmallArea : 1500;
        const configuredGroupRadius = Number(buildingGroup.groupRadiusMeters);
        const groupRadius = Number.isFinite(configuredGroupRadius) && configuredGroupRadius > 0
            && configuredGroupRadius <= 1000 ? configuredGroupRadius : 50;
        const configuredActivationRadius = Number(buildingGroup.activationRadiusMeters);
        const activationRadius = Number.isFinite(configuredActivationRadius)
            && configuredActivationRadius > 0 && configuredActivationRadius <= 1000
            ? configuredActivationRadius : groupRadius;
        const requireIndoorPoi = buildingGroup.requireIndoorPoi !== false;
        const buildingFeatures = new Map();
        const buildingAreas = new Map();
        const getBuildingId = building => String(building?.feature?.properties?.id
            ?? building?.feature?.id ?? `feature-${building?.index ?? "unknown"}`);
        const getBuildingArea = building => {
            const key = getBuildingId(building);
            if (buildingAreas.has(key)) return buildingAreas.get(key);
            let area = Infinity;
            try { area = turf.area(building.feature); } catch (_error) { /* 対象外 */ }
            buildingAreas.set(key, area);
            return area;
        };
        const getBuildingFeatures = building => {
            const key = getBuildingId(building);
            if (buildingFeatures.has(key)) return buildingFeatures.get(key);
            const matched = visibleIndoor.filter(item => {
                const bbox = item.bbox;
                if (!bbox || bbox[0] > building.bbox[2] || bbox[2] < building.bbox[0]
                    || bbox[1] > building.bbox[3] || bbox[3] < building.bbox[1]) return false;
                try {
                    return turf.booleanIntersects(building.feature, item.feature);
                } catch (_error) {
                    return true;
                }
            });
            buildingFeatures.set(key, matched);
            return matched;
        };
        const hasIndoorPoi = building => !requireIndoorPoi || getBuildingFeatures(building)
            .some(({ targets }) => poiCont.isPoiViewVisible(targets));
        const containingBuildings = buildingCandidates.filter(containsCenter).filter(hasIndoorPoi);
        let activeBuilding = null;
        let activeBuildings = [];
        let undergroundMode = false;
        let relevantIndoor = [];

        if (containingBuildings.length > 0) {
            // ベクタータイルでは建物全体と building:part が重なるため、
            // 中央を含む候補では外側の大きい輪郭を優先する。
            containingBuildings.sort((a, b) => getBuildingArea(b) - getBuildingArea(a)
                || distanceFromCenter(a.bbox) - distanceFromCenter(b.bbox));
            activeBuilding = containingBuildings[0];
        } else {
            // 道路や広場が画面中央にある場合も、一定距離内にある最寄りの建物を
            // 起点にする。建物内に中心がある場合は、従来どおり内包建物を優先する。
            const centerBounds = [center.lng, center.lat, center.lng, center.lat];
            const nearbyBuildings = buildingCandidates
                .filter(building => bboxDistanceMeters(centerBounds, building.bbox) <= activationRadius)
                .map(building => ({
                    ...building,
                    distanceMeters: distanceToFeatureMeters(building.feature)
                }))
                .filter(building => building.distanceMeters <= activationRadius && hasIndoorPoi(building))
                .sort((a, b) => a.distanceMeters - b.distanceMeters
                    || getBuildingArea(b) - getBuildingArea(a)
                    || getBuildingId(a).localeCompare(getBuildingId(b)));
            activeBuilding = nearbyBuildings[0] ?? null;
        }

        if (activeBuilding) {
            activeBuildings = [activeBuilding];
            if ((!largeBuildingOnly || largeBuildingActivation.groupNearbyBuildings)
                && getBuildingArea(activeBuilding) <= smallBuildingArea) {
                activeBuildings.push(...buildings.filter(building => building !== activeBuilding
                    && getBuildingArea(building) <= smallBuildingArea
                    && bboxDistanceMeters(activeBuilding.bbox, building.bbox) <= groupRadius
                    && distanceBetweenFeaturesMeters(activeBuilding.feature, building.feature) <= groupRadius
                    && hasIndoorPoi(building)));
            }
            const seenIndoor = new Set();
            relevantIndoor = activeBuildings.flatMap(getBuildingFeatures).filter(item => {
                const featureId = item.feature?.properties?.id ?? item.feature?.id;
                const key = featureId === undefined || featureId === null ? item.feature : String(featureId);
                if (seenIndoor.has(key)) return false;
                seenIndoor.add(key);
                return true;
            });
        } else {
            if (largeBuildingOnly) return null;
            const undergroundConfig = Conf.indoor?.underground ?? {};
            if (!undergroundConfig.useWithoutBuilding) return null;
            const configuredRadius = Number(undergroundConfig.activationRadiusMeters);
            const activationRadius = Number.isFinite(configuredRadius) && configuredRadius > 0
                && configuredRadius <= 1000 ? configuredRadius : 60;
            const nearbyIndoorFeatures = visibleIndoor.map(item => ({
                ...item,
                distanceMeters: distanceToFeatureMeters(item.feature)
            }));
            const nearbyUndergroundPoi = nearbyIndoorFeatures.some(({ feature, targets, distanceMeters }) =>
                poiCont.isPoiViewVisible(targets) && distanceMeters <= activationRadius
                && this.getIndoorFeatureLevels(feature)
                    .some(level => Number.isInteger(Number(level)) && Number(level) < 0));
            if (!nearbyUndergroundPoi) return null;
            undergroundMode = true;
            // 地下POIは建物輪郭がない場所でモードへ入るためのアンカーにだけ使う。
            // 入った後は、同じ駅・地下街にある地上階のPOIや level 省略の通路も表示対象にする。
            relevantIndoor = nearbyIndoorFeatures.filter(item => {
                if (!item.targets.includes("indoor") || item.distanceMeters > activationRadius) return false;
                const featureLevels = this.getIndoorFeatureLevels(item.feature)
                    .map(Number).filter(Number.isInteger);
                // 建物・モール全体を表す複数階POIは、周囲の全フロアを駅モードへ持ち込むため除外する。
                if (poiCont.isPoiViewVisible(item.targets)
                    && new Set(featureLevels).size > 1) return false;
                const isUnderground = featureLevels.some(level => level < 0);
                const isCorridor = item.feature?.properties?.highway === "corridor";
                if (isUnderground || isCorridor) return true;

                // 建物なしモードで、周囲の別ビル内にある地上階POIまで混ぜない。
                return !buildings.some(building => {
                    const bbox = item.bbox;
                    if (!bbox || bbox[0] > building.bbox[2] || bbox[2] < building.bbox[0]
                        || bbox[1] > building.bbox[3] || bbox[3] < building.bbox[1]) return false;
                    try {
                        return turf.booleanIntersects(building.feature, item.feature);
                    } catch (_error) {
                        return true;
                    }
                });
            });
        }
        if (relevantIndoor.length === 0) return null;
        if (!relevantIndoor.some(item =>
            this.isIndoorLayoutFeature(item.feature, item.targets))) return null;

        const relevantPoi = relevantIndoor.filter(({ targets }) => poiCont.isPoiViewVisible(targets));

        const poiLevelSet = new Set();
        relevantPoi.forEach(({ feature }) => {
            this.getIndoorPoiLevels(feature).forEach(level => {
                const normalizedLevel = this.normalizeIndoorLevelValue(level);
                if (normalizedLevel !== null) poiLevelSet.add(normalizedLevel);
            });
        });
        const poiLevels = this.sortIndoorLevelValues([...poiLevelSet]);
        const availableLevelSet = new Set(poiLevels);
        relevantIndoor.filter(({ feature, targets }) =>
            this.isIndoorRenderableFeature(feature)
            || poiCont.isPoiViewVisible(targets))
            .forEach(({ feature }) => {
                this.getIndoorFeatureLevels(feature).forEach(level => {
                    const normalizedLevel = this.normalizeIndoorLevelValue(level);
                    if (normalizedLevel !== null) availableLevelSet.add(normalizedLevel);
                });
            });
        const availableLevels = this.sortIndoorLevelValues([...availableLevelSet]);
        const buildingLevelRanges = activeBuildings.map(building => {
            const buildingPoiLevels = getBuildingFeatures(building)
                .filter(({ targets }) => poiCont.isPoiViewVisible(targets))
                .flatMap(({ feature }) => this.getIndoorPoiLevels(feature).map(Number))
                .filter(level => Number.isInteger(level) && level >= -100 && level <= 100);
            const heightLevel = this.getIndoorBuildingHighestLevel(building.feature) ?? 0;
            return {
                id: getBuildingId(building),
                min: buildingPoiLevels.length > 0 ? Math.min(0, ...buildingPoiLevels) : 0,
                max: buildingPoiLevels.length > 0
                    ? Math.max(heightLevel, ...buildingPoiLevels) : heightLevel
            };
        });
        let levels = [];
        if (availableLevels.length > 0) {
            const numericAvailableLevels = availableLevels.map(Number).filter(Number.isInteger);
            const lowestLevel = numericAvailableLevels[0] ?? 0;
            const highestLevel = Math.max(numericAvailableLevels.at(-1) ?? 0,
                ...buildingLevelRanges.map(range => range.max));
            levels = Array.from(
                { length: highestLevel - lowestLevel + 1 },
                (_, index) => String(lowestLevel + index)
            );
            if (availableLevels.includes("roof")) levels.push("roof");
        }
        const anchorBounds = activeBuildings.length > 0 ? activeBuildings.reduce((combined, building) => [
            Math.min(combined[0], building.bbox[0]), Math.min(combined[1], building.bbox[1]),
            Math.max(combined[2], building.bbox[2]), Math.max(combined[3], building.bbox[3])
        ], [Infinity, Infinity, -Infinity, -Infinity]) : relevantIndoor.reduce((combined, item) => [
            Math.min(combined[0], item.bbox[0]), Math.min(combined[1], item.bbox[1]),
            Math.max(combined[2], item.bbox[2]), Math.max(combined[3], item.bbox[3])
        ], [Infinity, Infinity, -Infinity, -Infinity]);
        const horizontalPadding = (viewBounds[2] - viewBounds[0]) * 0.12;
        const verticalPadding = (viewBounds[3] - viewBounds[1]) * 0.08;
        const safeTopPixels = Math.min(112, mapLibre.map.getContainer().clientHeight * 0.25);
        const safeTopLatitude = mapLibre.map.unproject([0, safeTopPixels]).lat;
        const anchor = [
            Math.min(anchorBounds[2], viewBounds[2] - horizontalPadding),
            Math.max(viewBounds[1] + verticalPadding,
                Math.min(anchorBounds[3], viewBounds[3] - verticalPadding, safeTopLatitude))
        ];
        const buildingId = activeBuilding?.feature?.properties?.id ?? activeBuilding?.feature?.id;
        const buildingIds = activeBuildings.map(getBuildingId).sort();
        const contextKey = buildingIds.length > 0 ? `buildings:${buildingIds.join(",")}` : "underground";
        return {
            anchor,
            contextKey,
            levels,
            poiLevels,
            availableLevels,
            buildingId: buildingId ? String(buildingId) : null,
            buildingFeature: activeBuilding?.feature ?? null,
            buildingIds,
            buildingFeatures: activeBuildings.map(building => building.feature),
            buildingLevelRanges,
            undergroundMode,
            largeBuildingMode: largeBuildingOnly,
            levelFeatureMode: false,
            indoorFeatureMode: true
        };
    }

    parseIndoorLevels(levelValue) {
        if (levelValue === undefined || levelValue === null || levelValue === "") return [];
        const levels = new Set();

        String(levelValue).split(";").forEach(rawPart => {
            const part = rawPart.trim();
            if (part === "") return;
            const range = part.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/);
            if (!range) {
                levels.add(part);
                return;
            }

            const start = Number(range[1]);
            const end = Number(range[2]);
            if (!Number.isInteger(start) || !Number.isInteger(end) || Math.abs(end - start) > 100) {
                levels.add(range[1]);
                levels.add(range[2]);
                return;
            }

            const step = start <= end ? 1 : -1;
            for (let level = start; level !== end + step; level += step) levels.add(String(level));
        });
        return [...levels];
    }

    getIndoorFeatureLevels(feature) {
        const properties = feature?.properties ?? {};
        const tags = properties.tags ?? properties;
        if (String(tags.location ?? "").trim().toLowerCase() === "roof") return ["roof"];
        const explicitLevels = [...new Set([
            ...this.parseIndoorLevels(tags.level),
            ...this.parseIndoorLevels(tags.repeat_on)
        ])];
        if (explicitLevels.length > 0) return explicitLevels;

        const fallbackLevels = Conf.indoor?.fallbackLevels ?? {};
        for (const [tagExpression, fallbackLevel] of Object.entries(fallbackLevels)) {
            const separator = tagExpression.indexOf("=");
            if (separator < 1) continue;
            const key = tagExpression.slice(0, separator);
            const value = tagExpression.slice(separator + 1);
            if (String(tags[key] ?? "") === value) return this.parseIndoorLevels(fallbackLevel);
        }
        return [];
    }

    getIndoorPoiLevels(feature) {
        const levels = this.getIndoorFeatureLevels(feature);
        return levels.length > 0 ? levels : ["0"];
    }

    getIndoorRenderFeatures(pois) {
        return (pois?.geojson ?? []).filter(feature => this.isIndoorRenderableFeature(feature));
    }

    isPoiVisibleInLevelMode(poi) {
        if (!this.levelModeActive) return true;
        if (!poi) return false;

        const levels = this.getIndoorPoiLevels(poi.geojson);
        return levels.includes(String(this.indoorLevel));
    }

    formatIndoorLevel(levelValue) {
        const normalizedLevel = this.normalizeIndoorLevelValue(levelValue);
        const levels = normalizedLevel === "roof" ? ["roof"] : this.parseIndoorLevels(levelValue);
        const labels = Conf.indoor?.levels?.labels ?? {};
        return levels.map(level => {
            if (labels[level] !== undefined) return labels[level];
            if (level === "roof") return "屋上";
            const number = Number(level);
            if (!Number.isFinite(number)) return level;
            return number >= 0 ? `${number + 1}F` : `B${Math.abs(number)}F`;
        }).join(" / ");
    }

    syncIndoorLevelControl(features, targetLists = []) {
        if (!Conf.indoor?.levels?.discoverFromData) return;
        if (!this.indoorLevelControlElement) return;
        const indoorZoom = this.getPoiZoom("indoor") ?? 18;
        const currentZoom = mapLibre.getZoom(false);
        const largeBuildingActivation = this.getIndoorLargeBuildingActivation();
        const largeBuildingOnly = largeBuildingActivation.use
            && currentZoom < indoorZoom
            && currentZoom >= largeBuildingActivation.minZoom;

        const mergedIndoor = mapLibre.mergeIndoorBuildingFeatures(features, targetLists);
        let context = this.getLevelFeatureControlContext(
            mergedIndoor.features,
            mergedIndoor.targetLists
        );
        if (!context && (currentZoom >= indoorZoom || largeBuildingOnly)) {
            context = this.getIndoorControlContext(mergedIndoor.features, mergedIndoor.targetLists, {
                largeBuildingOnly,
                largeBuildingActivation
            });
        }
        if (!context) {
            this.leaveIndoorMode();
            return;
        }
        const wasLevelModeActive = this.levelModeActive;
        const wasIndoorModeActive = this.indoorModeActive;
        const enteringLevelMode = !wasLevelModeActive;
        const contextChanged = this.indoorContextKey !== context.contextKey;
        this.levelModeActive = true;
        this.indoorModeActive = context.indoorFeatureMode === true;
        mapLibre.setIndoorBackgroundTransportationDimmed(this.indoorModeActive);
        this.indoorContextKey = context.contextKey;
        this.indoorBuildingId = context.buildingId;
        this.indoorBuildingFeature = context.buildingFeature;
        this.indoorBuildingIds = new Set(context.buildingIds ?? []);
        this.indoorBuildingFeatures = context.buildingFeatures ?? [];
        this.indoorBuildingLevelRanges = new Map((context.buildingLevelRanges ?? [])
            .map(range => [String(range.id), { min: Number(range.min), max: Number(range.max) }]));
        this.indoorUndergroundMode = context.undergroundMode === true;
        this.indoorRenderMinZoom = context.levelFeatureMode
            ? 0 : (context.largeBuildingMode ? largeBuildingActivation.minZoom : indoorZoom);
        if (enteringLevelMode || contextChanged || wasIndoorModeActive !== this.indoorModeActive) {
            const mode = !this.indoorModeActive ? "level-features"
                : (context.levelFeatureMode ? "indoor-layout"
                    : (this.indoorUndergroundMode ? "underground"
                    : (context.largeBuildingMode ? "large-building"
                        : `building-group:${this.indoorBuildingIds.size}`)));
            console.log(`cMapMaker: ${this.indoorModeActive ? "Indoor" : "Level"} mode (${mode}).`);
            if (enteringLevelMode) {
                this.indoorLevel = this.pendingInitialIndoorLevel
                    ?? String(Conf.indoor.defaultLevel ?? "0");
                this.pendingInitialIndoorLevel = null;
                this.updateIndoorLevelUrl();
            }
        }
        if (context.levels.length === 0) {
            mapLibre.hideIndoorLevelControl();
            return;
        }
        if (!context.availableLevels.includes(String(this.indoorLevel))) {
            this.indoorLevel = context.availableLevels[0];
        }
        this.indoorLevelControlElement.innerHTML = this.makeIndoorLevelButtons(
            context.levels,
            this.indoorLevel,
            context.availableLevels
        );
        this.initializeIndoorLevelPicker();
        mapLibre.setIndoorLevelControl(this.indoorLevelControlElement);
    }

    leaveIndoorMode() {
        mapLibre.setIndoorBackgroundTransportationDimmed(false);
        this.levelModeActive = false;
        this.indoorModeActive = false;
        this.indoorContextKey = null;
        this.indoorBuildingId = null;
        this.indoorBuildingFeature = null;
        this.indoorBuildingIds = new Set();
        this.indoorBuildingFeatures = [];
        this.indoorBuildingLevelRanges = new Map();
        this.indoorUndergroundMode = false;
        this.indoorRenderMinZoom = null;
        clearTimeout(this.indoorLevelWheelTimer);
        this.indoorLevelCandidate = null;
        mapLibre.hideIndoorLevelControl();
    }

    setIndoorLevel(level, updateUrl = true) {
        if (!Conf.indoor?.use) return;
        const nextLevel = String(level);
        const levelChanged = nextLevel !== String(this.indoorLevel);
        this.indoorLevel = nextLevel;
        if (levelChanged) {
            document.querySelectorAll("#listArea .selected").forEach(row => row.classList.remove("selected"));
            geoCont.writePoiCircle();
            geoCont.clearPolygon();
            if (this.openOSMid || this.detail) this.clearDatail();
        }
        if (this.indoorLevelControlElement) {
            this.indoorLevelControlElement.querySelectorAll("button[data-level]").forEach(button => {
                const selected = button.dataset.level === this.indoorLevel;
                button.classList.toggle("active", selected);
                button.classList.toggle("pending", selected);
                button.setAttribute("aria-selected", String(selected));
            });
        }
        this.viewIndoor(false);
        listTable.makeList();
        const keyword = String(document.getElementById("list_keyword")?.value ?? "").trim();
        if (keyword !== "") listTable.filterKeyword(keyword);
        listTable.filterByPoiStatus(this.visitedFilterStatus, this.favoriteFilter);
        this.makeImages(Conf.thumbnail.use);
        this.viewPoi(listTable.getSelCategory());

        if (updateUrl) this.updateIndoorLevelUrl();
    }

    updateIndoorLevelUrl() {
        if (!Conf.indoor.control?.urlParameter || this.indoorLevel === null) return;
        const parameter = Conf.indoor.control.urlParameter;
        const params = location.search.slice(1).split("&")
            .filter(Boolean)
            .filter(param => decodeURIComponent(param.split("=")[0]) !== parameter);
        params.push(`${encodeURIComponent(parameter)}=${encodeURIComponent(this.indoorLevel)}`);
        history.replaceState("", "", location.pathname + "?" + params.join("&") + location.hash);
    }

    withIndoorLevel(pathAndQuery) {
        if (!Conf.indoor?.use || !Conf.indoor.control?.urlParameter || this.indoorLevel === null) return pathAndQuery;
        const separator = pathAndQuery.includes("?") ? "&" : "?";
        return `${pathAndQuery}${separator}${encodeURIComponent(Conf.indoor.control.urlParameter)}=${encodeURIComponent(this.indoorLevel)}`;
    }

    viewIndoor(refreshContext = true) {
        if (!Conf.indoor?.use || Conf.osm?.indoor?.expression?.renderer !== "indoor") return;
        const pois = poiCont.getPois("indoor", false);
        if (refreshContext) {
            const controlPois = poiCont.getPois("-", false);
            this.syncIndoorLevelControl(controlPois.geojson, controlPois.targets);
        }
        mapLibre.addIndoor({
            "type": "FeatureCollection",
            "features": this.getIndoorRenderFeatures(pois)
        }, "indoor", this.indoorLevel);
    }
}
