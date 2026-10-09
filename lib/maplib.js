"use strict";
// MapLibre Control
class Maplibre {

    constructor() {
        this.map;
        this.minimap;
        this.Control = { "locate": "", "maps": "" };    // MapLibre object
        this.popup = null;
        this.styles = {};
        this.selectStyle;
        this.TriggerRepaint;
        this.webglContextLost = false;
        this.indoorElevationEventsBound = false;
        this.indoorLayerStates = new Map();
        this.indoorLevelMarker = null;
        this.indoorLevelControlObserver = null;
        this.indoorLevelControlElement = null;
        this.indoorBuildingSourceId = null;
        this.indoorBuildingSourceFailed = false;
        this.indoorBuildingRefreshTimer = null;
        this.indoorBuildingFeatureCount = null;
        this.indoorBuildingFeaturesCache = null;
        this.indoorBackgroundTransportationOpacities = new Map();
        this.mapListControlObserver = null;
        this.mapListControlElement = null;
        this.userLocation = null;
        this.geojsonSourceRevisions = new Map();
    }

    init(Conf) {
        function extractFilenamesFromTag(tag) { // タグからファイル名を返す
            const result = new Set()
            for (const key in tag) {
                const valueMap = tag[key]
                for (const val in valueMap) result.add(valueMap[val])
            }
            return result
        }

        function extractFilenamesFromSubtag(subtag) {
            const result = new Set()
            for (const keyEqVal in subtag) {
                const valueMap = subtag[keyEqVal]
                for (const subkey in valueMap) {
                    const icons = valueMap[subkey]
                    for (const subval in icons) result.add(icons[subval])
                }
            }
            return result
        }

        function waitForMapLoad(map, timeout = 60000) {
            return new Promise((resolve, reject) => {
                if (map && map.isStyleLoaded && map.isStyleLoaded()) return resolve();
                const timer = setTimeout(() => {
                    cleanup();
                    reject(new Error("Map load timeout. Check Tile Name ok?"));
                }, timeout);
                const onStyle = () => { cleanup(); resolve(); };
                const onErr = (e) => { console.warn("Map error during load:", e?.error || e) };
                const cleanup = () => {
                    clearTimeout(timer);
                    map.off("style.load", onStyle);
                    map.off("error", onErr);
                };
                map.once("style.load", onStyle);
                map.on("error", onErr);
            });
        }

        return new Promise((resolve, reject) => {
            console.log("Maplibre: init start.");
            this.selectStyle = Conf.map.tileName;
            Object.keys(Conf.tile).forEach(key => {
                const style = Conf.tile[key].style;
                this.styles[key] = typeof style === "string"
                    ? window.withAppAssetVersion(style) : style;
            })
            let protocol = new pmtiles.Protocol()
            maplibregl.addProtocol("pmtiles", protocol.tile)
            this.map = new maplibregl.Map({
                container: 'mapid',
                style: this.styles[this.selectStyle],
                transformRequest: (url, resourceType) => this.transformGlyphRequest(url, resourceType),
                maxZoom: Conf.map.maxZoom,
                zoom: Conf.map.initZoom,

                canvasContextAttributes: {
                    // Keep MapLibre's lightweight default unless explicitly requested.
                    antialias: Conf.map.antialias === true
                },

                hash: true,
                maxBounds: Conf.map.maxBounds,
                center: Conf.map.viewCenter,
                pitch: Conf.map.viewPitch,
                maxPitch: Conf.map.maxPitch,
                attributionControl: false,
                localIdeographFontFamily: ['sans-serif']
            });
            this.bindIndoorBuildingSourceEvents();

            const mapContainer = this.map.getContainer();
            const mapCanvas = this.map.getCanvas();
            mapCanvas.addEventListener("webglcontextlost", () => {
                this.webglContextLost = true;
            });
            mapCanvas.addEventListener("webglcontextrestored", () => {
                this.webglContextLost = false;
            });
            // Firefoxでは静止後の最初のドラッグ時に、WebGLの描画再開が
            // pointermoveと重なって一瞬遅れることがある。MapLibreの
            // ドラッグ処理より先に次フレームの描画を予約しておく。
            mapCanvas.addEventListener("pointerdown", () => {
                if (!this.webglContextLost && this.map?.style) this.map.triggerRepaint();
            }, { capture: true, passive: true });
            const stopEventWithoutMapStyle = (event) => {
                if (!mapContainer.contains(event.target)) return;
                if (!this.webglContextLost && this.map && this.map.style) return;
                if (event.cancelable) event.preventDefault();
                event.stopImmediatePropagation();
            };
            ["click", "dblclick", "mousedown", "mouseup", "mousemove", "contextmenu", "wheel",
                "touchstart", "touchmove", "touchend"].forEach((eventName) => {
                    document.addEventListener(eventName, stopEventWithoutMapStyle, true);
                });

            this.map.scrollZoom.setWheelZoomRate(1 / 450);
            this.map.scrollZoom.setZoomRate(1 / 420);
            this.TriggerRepaint = this.map.triggerRepaint;
            const fnames1 = new Set([...extractFilenamesFromTag(Conf.marker.tag), ...extractFilenamesFromSubtag(Conf.marker.subtag)]);
            const markerImageIds = new Set([...fnames1].map(file => file.replace(/\.svg$/i, ".png")));
            const loadingMarkerImages = new Map();

            this.map.on("styleimagemissing", (event) => {
                const imageId = event.id;
                if (!markerImageIds.has(imageId) || this.map.hasImage(imageId) || loadingMarkerImages.has(imageId)) return;

                // styleimagemissing must be handled synchronously. Keep the image ID
                // valid while the actual marker is loaded, otherwise MapLibre reports
                // the missing image before the asynchronous request completes.
                this.map.addImage(imageId, {
                    width: 1,
                    height: 1,
                    data: new Uint8Array(4)
                });

                const loading = this.map.loadImage(window.withAppAssetVersion("./" + Conf.icon.fgPath + "/" + imageId))
                    .then((image) => {
                        if (this.map.hasImage(imageId)) this.map.removeImage(imageId);
                        this.map.addImage(imageId, image.data);
                    })
                    .catch((error) => {
                        console.warn(`Marker image load failed: ${imageId}`, error);
                    })
                    .finally(() => {
                        loadingMarkerImages.delete(imageId);
                    });

                loadingMarkerImages.set(imageId, loading);
            });
            console.log(`Maplibre: new Map(${Conf.map.tileName})`);

            waitForMapLoad(mapLibre.map, 60000).then(async () => {
                setTimeout(() => {
                    mapLibre.map.setSky({ "sky-color": "#5090D0" });
                    mapLibre.map.setSky(Conf.skyStyle);
                }, 1000)
                await Promise.all(Conf.marker.background.map(async (file) => {
                    const image = await this.map.loadImage(
                        window.withAppAssetVersion("./" + Conf.icon.bgPath + "/" + file)
                    );
                    this.map.addImage(file, image.data);
                }));
                console.log("Maplibre: init end.")
                resolve()
            }).catch(reject);
        });
    };

    enable(flag) {
        if (flag) {
            this.map.scrollWheelZoom.enable();
            this.map.dragging.enable();
        } else {
            this.map.scrollWheelZoom.disable();
            this.map.dragging.disable();
        }
    };

    start() {
        if (this.map !== undefined) {
            this.map.getCanvas().style.pointerEvents = "";
            this.map.triggerRepaint = this.TriggerRepaint;
            //this.map.triggerRepaint(); // 即時再描画
        }
        if (this.minimap !== undefined) {
            this.minimap.resize()
            this.minimap.getCanvas().style.pointerEvents = "";
            this.minimap.triggerRepaint = this.TriggerRepaint;
            this.minimap.triggerRepaint(); // 即時再描画
        }
    };

    stop(pauseRepaint = true) {
        if (this.map !== undefined) {
            this.map.getCanvas().style.pointerEvents = "none";
            if (pauseRepaint) this.map.triggerRepaint = () => { };
        }
        if (this.minimap !== undefined) {
            this.minimap.getCanvas().style.pointerEvents = "none";
            if (pauseRepaint) this.minimap.triggerRepaint = () => { };
        }
    };

    // Change Map Style / tilename:タイル名。空欄の時は設定された次のスタイル
    changeMap(tilename) {
        let styles = Object.keys(this.styles);
        let nextSt = (styles.indexOf(this.selectStyle) + 1) % styles.length;
        while (Conf.tile[styles[nextSt]].skip == true) {
            nextSt = (nextSt + 1) % styles.length;
        }
        this.selectStyle = !tilename ? styles[nextSt] : tilename;
        mapLibre.map.setStyle(this.styles[this.selectStyle]);
        setTimeout(() => {
            mapLibre.map.setSky({ "sky-color": "#5090D0" });
            mapLibre.map.setSky(Conf.skyStyle);
        }, 1000)
        return this.selectStyle;
    };

    on(event, callback) { this.map.on(event, callback); };

    openPopup(marker, params) {
        if (this.popup !== null) this.popup.close();
        setTimeout((() => { this.popup = L.popup(marker.getLngLat(), params).openOn(this.map); }).bind(this), 100);
    };

    transformGlyphRequest(url, resourceType) {
        // Variation selectors have no standalone glyph. The tile font service
        // rejects this range; an empty protobuf lets the base character render.
        if (resourceType === "Glyphs") {
            const parsed = new URL(url, window.location.href);
            if (parsed.origin === "https://tile.openstreetmap.jp"
                && /^\/fonts\/[^/]+\/917760-918015\.pbf$/.test(parsed.pathname)) {
                return { url: "data:application/x-protobuf;base64," };
            }
        }
        return { url };
    }

    flyTo(ll, zoomlv) { this.map.flyTo({ center: ll, zoom: zoomlv, speed: 2, essential: true }); };

    // return Zoom Level / round: Math.Round(true or false)
    getZoom(round) { return round ? Math.round(this.map.getZoom() * 10) / 10 : this.map.getZoom(); };

    setZoom(zoomlv) { this.map.flyTo({ center: this.map.getCenter(), zoom: zoomlv, speed: 0.5 }); };

    getCenter() { return this.map.getBounds().getCenter(); };

    setIndoorLevelControl(element) {
        if (!this.map || !element) return;
        const container = this.map.getContainer();
        if (element.parentElement !== container) container.appendChild(element);
        const updatePosition = () => {
            this.setGlobalStatusControlPosition(this.globalStatusControlElement);
            const baseList = document.getElementById("baselist");
            const baseListRect = baseList?.getBoundingClientRect();
            const statusRect = document.getElementById("globalStatus")?.getBoundingClientRect();
            const gap = window.matchMedia?.("(max-width: 575.98px)").matches ? 6 : 10;
            const top = Math.max(baseListRect?.bottom ?? 0,
                statusRect?.height > 0 ? statusRect.bottom : 0);
            element.style.top = `${Math.round(top) + gap}px`;
            element.style.left = `${Math.max(gap, Math.round(baseListRect?.left ?? gap))}px`;
        };
        if (this.indoorLevelControlElement !== element) {
            this.indoorLevelControlObserver?.disconnect();
            this.indoorLevelControlElement = element;
            this.indoorLevelControlObserver = new ResizeObserver(updatePosition);
            const baseList = document.getElementById("baselist");
            if (baseList) this.indoorLevelControlObserver.observe(baseList);
            const globalStatus = document.getElementById("globalStatus");
            if (globalStatus) this.indoorLevelControlObserver.observe(globalStatus);
            this.indoorLevelControlObserver.observe(container);
        }
        updatePosition();
        element.hidden = false;
    };

    hideIndoorLevelControl() {
        const element = document.getElementById("indoorLevelControl");
        if (element) element.hidden = true;
        this.setGlobalStatusControlPosition(this.globalStatusControlElement);
    };

    setMapListControlPosition(element) {
        if (!this.map || !element) return;
        const updatePosition = () => {
            const mapRect = this.map.getContainer().getBoundingClientRect();
            const topPaneRect = document.getElementById("top-pane")?.getBoundingClientRect();
            const sidebarControl = document.getElementById("sidebarCont");
            const sidebarRect = sidebarControl?.getBoundingClientRect();
            const sidebarVisible = sidebarControl
                && getComputedStyle(sidebarControl).display !== "none"
                && sidebarRect.width > 0 && sidebarRect.height > 0;
            const visibleBottom = Math.min(
                topPaneRect?.bottom ?? mapRect.bottom,
                sidebarVisible ? sidebarRect.top : mapRect.bottom
            );
            const coveredHeight = Math.max(0, mapRect.bottom - visibleBottom);
            const coveredWidth = topPaneRect
                ? Math.max(0, mapRect.right - topPaneRect.right) : 0;
            element.style.marginBottom = `${Math.round(coveredHeight) + 12}px`;
            element.style.marginRight = `${Math.round(coveredWidth) + 10}px`;
        };
        if (this.mapListControlElement !== element) {
            this.mapListControlObserver?.disconnect();
            this.mapListControlElement = element;
            this.mapListControlObserver = new ResizeObserver(updatePosition);
            this.mapListControlObserver.observe(this.map.getContainer());
            const topPane = document.getElementById("top-pane");
            const sidebarControl = document.getElementById("sidebarCont");
            if (topPane) this.mapListControlObserver.observe(topPane);
            if (sidebarControl) this.mapListControlObserver.observe(sidebarControl);
        }
        updatePosition();
    };

    getIndoorBuildingSourceConfig() {
        const config = Conf.indoor?.buildingSource;
        if (!Conf.indoor?.use || config?.type !== "vectorTile") return null;
        const sourceLayer = String(config.sourceLayer ?? "").trim();
        if (sourceLayer === "") return null;
        return config;
    };

    ensureIndoorBuildingSource() {
        const config = this.getIndoorBuildingSourceConfig();
        if (!config || !this.map?.style || !this.map.isStyleLoaded?.()) return false;

        const styleSource = String(config.styleSource ?? "").trim();
        const dedicatedSource = String(config.dedicatedSource ?? "indoor-building-tiles").trim();
        const sourceUrl = String(config.sourceUrl ?? "").trim();
        let sourceId = styleSource && this.map.getSource(styleSource) ? styleSource : dedicatedSource;

        if (!this.map.getSource(sourceId)) {
            if (sourceId === "" || sourceUrl === "") return false;
            try {
                this.map.addSource(sourceId, { type: "vector", url: sourceUrl });
            } catch (error) {
                console.warn("Maplibre: Indoor building source setup failed.", error);
                return false;
            }
        }

        if (sourceId === dedicatedSource) {
            const loaderLayerId = `${dedicatedSource}-loader`;
            if (!this.map.getLayer(loaderLayerId)) {
                try {
                    this.map.addLayer({
                        id: loaderLayerId,
                        type: "fill",
                        source: sourceId,
                        "source-layer": String(config.sourceLayer),
                        minzoom: 13,
                        paint: { "fill-color": "#000000", "fill-opacity": 0 }
                    });
                } catch (error) {
                    console.warn("Maplibre: Indoor building loader layer setup failed.", error);
                    return false;
                }
            }
        }

        this.indoorBuildingSourceId = sourceId;
        return true;
    };

    bindIndoorBuildingSourceEvents() {
        if (!this.map || !this.getIndoorBuildingSourceConfig()) return;
        this.map.on("style.load", () => {
            this.indoorBackgroundTransportationOpacities.clear();
            this.indoorBuildingSourceFailed = false;
            this.indoorBuildingFeaturesCache = null;
            this.ensureIndoorBuildingSource();
            if (typeof cMapMaker !== "undefined" && cMapMaker.indoorModeActive) {
                this.setIndoorBackgroundTransportationDimmed(true);
            }
            this.scheduleIndoorBuildingRefresh();
        });
        this.map.on("sourcedata", event => {
            if (!event?.isSourceLoaded || event.sourceId !== this.indoorBuildingSourceId) return;
            this.indoorBuildingFeaturesCache = null;
            this.scheduleIndoorBuildingRefresh();
        });
        this.map.on("moveend", () => {
            this.indoorBuildingFeaturesCache = null;
        });
        this.map.on("error", event => {
            if (!this.indoorBuildingSourceId || event?.sourceId !== this.indoorBuildingSourceId) return;
            this.indoorBuildingSourceFailed = true;
            this.indoorBuildingFeaturesCache = null;
            console.warn(`Maplibre: Indoor building tile failed (${this.indoorBuildingSourceId}).`);
        });
    };

    setIndoorBackgroundTransportationDimmed(dimmed) {
        if (!this.map?.getStyle) return;
        const configuredOpacity = Number(Conf.indoor?.backgroundTransportationOpacity);
        const indoorOpacity = Number.isFinite(configuredOpacity)
            && configuredOpacity >= 0 && configuredOpacity <= 1 ? configuredOpacity : 0.08;

        if (dimmed) {
            const layers = this.map.getStyle()?.layers ?? [];
            layers.filter(layer => String(layer["source-layer"] ?? "") === "transportation"
                && (layer.type === "fill"
                    || (layer.type === "line"
                        && /"(?:rail|path|pedestrian)"/.test(JSON.stringify(layer.filter ?? [])))))
                .forEach(layer => {
                    if (!this.map.getLayer(layer.id)) return;
                    const property = layer.type === "line" ? "line-opacity" : "fill-opacity";
                    const key = `${layer.id}:${property}`;
                    if (this.indoorBackgroundTransportationOpacities.has(key)) return;
                    const originalOpacity = this.map.getPaintProperty(layer.id, property);
                    this.indoorBackgroundTransportationOpacities.set(key, {
                        layerId: layer.id,
                        property,
                        opacity: originalOpacity
                    });
                    this.map.setPaintProperty(layer.id, property, [
                        "case",
                        [
                            "any",
                            ["==", ["get", "class"], "rail"],
                            ["match", ["get", "subclass"], ["platform", "footway"], true, false]
                        ],
                        indoorOpacity,
                        originalOpacity ?? 1
                    ]);
                });
            return;
        }

        this.indoorBackgroundTransportationOpacities.forEach(state => {
            if (!this.map.getLayer(state.layerId)) return;
            this.map.setPaintProperty(
                state.layerId,
                state.property,
                state.opacity === undefined ? null : state.opacity
            );
        });
        this.indoorBackgroundTransportationOpacities.clear();
    }

    scheduleIndoorBuildingRefresh() {
        clearTimeout(this.indoorBuildingRefreshTimer);
        this.indoorBuildingRefreshTimer = setTimeout(() => {
            if (typeof cMapMaker === "undefined" || cMapMaker.status !== "normal") return;
            cMapMaker.viewIndoor();
        }, 180);
    };

    getIndoorBuildingFeatures() {
        const config = this.getIndoorBuildingSourceConfig();
        if (!config || this.indoorBuildingSourceFailed || !this.ensureIndoorBuildingSource()) {
            return { available: false, features: [] };
        }
        if (Array.isArray(this.indoorBuildingFeaturesCache)) {
            return { available: true, features: this.indoorBuildingFeaturesCache };
        }

        let sourceFeatures = [];
        try {
            sourceFeatures = this.map.querySourceFeatures(this.indoorBuildingSourceId, {
                sourceLayer: String(config.sourceLayer)
            });
        } catch (_error) {
            return { available: true, features: [] };
        }

        const heightProperty = String(config.heightProperty ?? "render_height");
        const minHeightProperty = String(config.minHeightProperty ?? "render_min_height");
        const seen = new Set();
        const hashText = value => {
            let hash = 2166136261;
            for (let index = 0; index < value.length; index++) {
                hash ^= value.charCodeAt(index);
                hash = Math.imul(hash, 16777619);
            }
            return (hash >>> 0).toString(36);
        };
        const features = sourceFeatures.flatMap(feature => {
            if (!feature?.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) return [];
            const geometry = feature.geometry.toJSON?.() ?? {
                type: feature.geometry.type,
                coordinates: feature.geometry.coordinates
            };
            const signature = JSON.stringify(geometry.coordinates);
            const sourceFeatureId = feature.id === undefined || feature.id === null
                ? hashText(signature) : String(feature.id);
            const id = `tile-building/${sourceFeatureId}`;
            if (config.deduplicate !== false && seen.has(id)) return [];
            seen.add(id);
            const properties = { ...(feature.properties ?? {}) };
            const height = properties[heightProperty] ?? properties.height;
            const minHeight = properties[minHeightProperty] ?? properties.min_height;
            return [{
                type: "Feature",
                id,
                geometry,
                properties: {
                    ...properties,
                    id,
                    ...(height !== undefined ? { height } : {}),
                    ...(minHeight !== undefined ? { min_height: minHeight } : {}),
                    __indoorBuildingSource: "vectorTile"
                }
            }];
        });
        if (this.indoorBuildingFeatureCount !== features.length) {
            this.indoorBuildingFeatureCount = features.length;
            console.log(`Maplibre: Indoor buildings from vector tile (${features.length}).`);
        }
        this.indoorBuildingFeaturesCache = features;
        return { available: true, features };
    };

    mergeIndoorBuildingFeatures(features = [], targetLists = []) {
        const mergedFeatures = [];
        const mergedTargets = [];
        features.forEach((feature, index) => {
            const isBuilding = feature?.properties?.building !== undefined
                && ["Polygon", "MultiPolygon"].includes(feature?.geometry?.type);
            if (isBuilding) return;
            mergedFeatures.push(feature);
            mergedTargets.push(targetLists[index] ?? []);
        });
        const tileBuildings = this.getIndoorBuildingFeatures();
        if (!tileBuildings.available) return { features: mergedFeatures, targetLists: mergedTargets };
        tileBuildings.features.forEach(feature => {
            mergedFeatures.push(feature);
            mergedTargets.push(["indoor"]);
        });
        return { features: mergedFeatures, targetLists: mergedTargets };
    };

    get_LL(lll) {			// LngLatエリアの設定 [経度lng,緯度lat] lll:少し大きめにする
        let ll = { "NW": this.map.getBounds().getNorthWest(), "SE": this.map.getBounds().getSouthEast() };
        if (lll) {
            ll.NW.lng = ll.NW.lng * 0.999998;
            ll.SE.lng = ll.SE.lng * 1.000002;
            ll.SE.lat = ll.SE.lat * 0.999998;
            ll.NW.lat = ll.NW.lat * 1.000002;
        }
        return ll;
    };

    getMiniLL(lll) {
        if (this.minimap == undefined) return undefined
        let ll = { "NW": this.minimap.getBounds().getNorthWest(), "SE": this.minimap.getBounds().getSouthEast() };
        if (lll) {
            ll.NW.lng = ll.NW.lng * 0.999997;
            ll.SE.lng = ll.SE.lng * 1.000003;
            ll.SE.lat = ll.SE.lat * 0.999997;
            ll.NW.lat = ll.NW.lat * 1.000003;
        }
        return ll;
    }

    addControl(position, domid, html, cname) {     // add MapLibre control
        class HTMLControl {
            onAdd(map) {
                this._map = map;
                this._container = document.createElement('div');
                this._container.id = domid;
                this._container.className = 'maplibregl-ctrl ' + cname;
                this._container.innerHTML = html;
                this._container.style = "transform: initial;";
                if (domid === "maplist") {
                    requestAnimationFrame(() => mapLibre.setMapListControlPosition(this._container));
                }
                return this._container;
            }
            onRemove() {
                if (domid === "maplist" && mapLibre.mapListControlElement === this._container) {
                    mapLibre.mapListControlObserver?.disconnect();
                    mapLibre.mapListControlElement = null;
                }
                this._container.parentNode.removeChild(this._container);
                this._map = undefined;
            }
        }
        this.map.addControl(new HTMLControl(), position);
    };

    setGlobalStatusControlPosition(element) {
        if (!this.map || !element) return;
        const container = this.map.getContainer();
        if (element.parentElement !== container) container.appendChild(element);
        const updatePosition = () => {
            const baseList = document.getElementById("baselist");
            const baseListRect = baseList?.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const gap = window.matchMedia?.("(max-width: 575.98px)").matches ? 6 : 10;
            const top = baseListRect?.bottom ?? containerRect.top;
            const left = baseListRect?.left ?? containerRect.left;
            element.style.top = `${Math.round(top - containerRect.top) + gap}px`;
            element.style.left = `${Math.max(gap, Math.round(left - containerRect.left) + gap)}px`;
        };
        if (this.globalStatusControlElement !== element) {
            this.globalStatusControlObserver?.disconnect();
            this.globalStatusControlElement = element;
            this.globalStatusControlObserver = new ResizeObserver(updatePosition);
            const baseList = document.getElementById("baselist");
            if (baseList) this.globalStatusControlObserver.observe(baseList);
            this.globalStatusControlObserver.observe(container);
        }
        updatePosition();
    };

    addNavigation(position) {                               // add location
        this.map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: '' }), "bottom-left");
        this.map.addControl(new maplibregl.NavigationControl(), position);
        const geolocate = new maplibregl.GeolocateControl({ trackUserLocation: true });
        geolocate.on("geolocate", event => {
            const longitude = Number(event?.coords?.longitude);
            const latitude = Number(event?.coords?.latitude);
            if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
            this.userLocation = [longitude, latitude];
            if (typeof listTable !== "undefined") listTable.refreshDerivedValues();
        });
        this.map.addControl(geolocate, position);
    };

    getUserLocation() {
        return this.userLocation ? [...this.userLocation] : null;
    };

    addScale(position) { this.map.addControl(new maplibregl.ScaleControl(), position); };

    //
    updateVisitedCountry() {
        let visitedcountory = poiCont.getPolygonVisitedCountory()
        let viss = this.minimap.getSource("viss");
        if (viss !== undefined) viss.setData({ type: 'FeatureCollection', features: visitedcountory })
    }

    // ミニマップ表示(初期設定)
    addMiniMap() {
        return new Promise((resolve) => {
            console.log("addMiniMap: Start")
            const mmap = document.getElementById("mini-map")
            if (this.minimap === null || this.minimap === undefined) {  // 初回設定
                let planet = Conf.tile.miniMap.style
                const touchDevice = window.matchMedia('(any-pointer: coarse)').matches;
                this.minimap = new maplibregl.Map({
                    container: 'mini-map', style: planet, interactive: true,
                    attributionControl: false, localIdeographFontFamily: ['sans-serif'],
                    cooperativeGestures: touchDevice,
                    locale: {
                        'CooperativeGesturesHandler.MobileHelpText': glot.lang === 'ja'
                            ? '2本指で地図を操作' : 'Use two fingers to move the map'
                    }
                })
                // Detail visibility and sidebar resizing can change the globe
                // container without a browser resize event.
                if (typeof ResizeObserver !== 'undefined') {
                    this.minimapResizeObserver = new ResizeObserver(() => {
                        if (mmap.clientWidth > 0 && mmap.clientHeight > 0) {
                            this.minimap.resize();
                        }
                    });
                    this.minimapResizeObserver.observe(mmap);
                }
                this.minimap.on('style.load', () => {
                    let allcountry = []
                    let visitedcountory = poiCont.getPolygonVisitedCountory()
                    let countries = poiCont.getAllOSMCountryCode()      // 国コードがある施設一覧
                    if (countries.length > 0) {
                        countries.forEach((CCode) => {
                            let CPoly = poiCont.getPolygonByCountryCode(CCode)
                            if (CPoly !== undefined) allcountry.push(CPoly[0])
                        })
                    }
                    this.minimap.addSource("alls", { type: 'geojson', data: { type: 'FeatureCollection', features: allcountry } })
                    this.minimap.addSource("viss", { type: 'geojson', data: { type: 'FeatureCollection', features: visitedcountory } })
                    this.minimap.addSource("sels", { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
                    this.minimap.addLayer({ id: 'alls-fill', type: 'fill', source: 'alls', paint: { 'fill-color': '#002200', 'fill-opacity': 0.2 } })
                    this.minimap.addLayer({ id: 'viss-fill', type: 'fill', source: 'viss', paint: { 'fill-color': '#88FF88', 'fill-opacity': 0.3 } })
                    this.minimap.addLayer({ id: 'sels-fill', type: 'fill', source: 'sels', paint: { 'fill-color': '#FF8844', 'fill-opacity': 0.6 } })
                    this.minimap.setProjection({ "type": "globe" }) // globe表示には fog が必要
                    mapLibre.addMiniMapControl("top-left", "flags", "");
                    mmap.classList.remove("d-none")
                    this.minimap.resize();
                    this.minimap.setCenter(Conf.map.viewCenter)
                    this.minimap.setZoom(Conf.minimap.initZoom)
                    this.minimap.on('click', this.#miniMapClick)
                    console.log("addMiniMap: End")
                    resolve(true)
                })
            } else {
                resolve(true)
            }
        })
    }

    addMiniMapControl(position, domid, html, cname) {     // add MapLibre control for MiniMap
        class HTMLControl {
            onAdd(map) {
                this._map = map;
                this._container = document.createElement('div');
                this._container.id = domid;
                this._container.className = 'maplibregl-ctrl ' + cname;
                this._container.innerHTML = html;
                this._container.style = "transform: initial;";
                return this._container;
            }
            onRemove() {
                this._container.parentNode.removeChild(this._container);
                this._map = undefined;
            }
        }
        this.minimap.addControl(new HTMLControl(), position);
    }

    viewMiniMap(view) {
        const method = view ? "remove" : "add"
        document.getElementById("mini-map").classList[method]("d-none")
        if (view && this.minimap) this.minimap.resize();
    }

    #miniMapClick(e) {
        console.log("#miniMapClick: Start")
        const pt = turf.point([e.lngLat.lng, e.lngLat.lat])
        const matches = poiCont.getPolygonByPoint(pt)  // 国判定
        if (matches.length > 0) {               // 地図移動（miniMapとmapの両方）
            let CCode = matches[0].properties["ISO3166-1-Alpha-2"];
            let OSMID = poiCont.getOsmidByCountryCode(CCode);
            if (OSMID !== "") {
                poiCont.select(OSMID, !cMapMaker.minimap, cMapMaker.minimap ? -1 : 0);
                mapLibre.#highlightCountry(matches)
                let geojson = poiCont.get_osmid(OSMID).geojson
                geoCont.writePoiCircle(geojson)
                geoCont.flashPolygon(geojson)
                console.log("#miniMapClick: End")
            }
        }
    }

    // ISO-3166 Alpha-2に基づいてminimapを移動してハイライト化
    showCountryByCode(CCode) {
        let matches = []
        console.log("showCountryByCode");
        let countries = CCode.split(";")
        this.addMiniMap().then(() => {
            this.updateVisitedCountry()
            for (let cno = 0; cno < countries.length; cno++) {
                const match = poiCont.getPolygonByCountryCode(countries[cno]);
                if (match.length == 0) { console.warn("showCountryByCode: Not found: ", countries[cno]); continue }
                matches.push(match[0])
            }
            this.#highlightCountry(matches)
        })
    }

    // 指定したGeoJsonから一番大きいポリゴンを返す
    #getLargestPolygonFromMultiPolygon(feature) {
        if (feature.geometry.type !== "MultiPolygon") return feature;
        const polygons = feature.geometry.coordinates.map(coords => turf.polygon(coords, feature.properties));
        let largest = polygons[0];
        let maxArea = turf.area(largest);
        for (let i = 1; i < polygons.length; i++) {
            const area = turf.area(polygons[i]);
            if (area > maxArea) { largest = polygons[i]; maxArea = area; }
        }
        return largest;
    }

    // 指定したgeoJsonをハイライト
    #highlightCountry(feature) {
        const highlight = function () {
            console.log("geoLib: #highlightCountry: " + feature[0].properties["ISO3166-1-Alpha-2"])
            this.minimap.getSource("sels").setData({ type: 'FeatureCollection', features: feature })
            let largestFeature = this.#getLargestPolygonFromMultiPolygon(feature[0])
            let maxArea = turf.area(largestFeature)
            for (let i = 1; i < feature.length; i++) {
                const candidate = this.#getLargestPolygonFromMultiPolygon(feature[i])
                const area = turf.area(candidate)
                if (area > maxArea) largestFeature = candidate; maxArea = area
            }
            const bbox = turf.bbox(largestFeature)
            const bboxCenter = function (bbox) {
                const [minX, minY, maxX, maxY] = bbox
                return [(minX + maxX) / 2, (minY + maxY) / 2]
            }
            const area = turf.area(largestFeature)
            const center = bboxCenter(bbox)
            const zoom = area < 5e9 ? 4.5 : area < 1e11 ? 3.5 : area < 1e12 ? 3 : 2
            this.minimap.flyTo({ center, zoom: zoom, duration: 1000, essential: true })
        }.bind(this)
        if (feature.length > 0) highlight()
    }

    // 指定した国コードリストの画像を読み込む
    async addCountryFlagsImage(countries) {
        const flagPath = (Conf.icon?.flagPath ?? "https://flagcdn.com/w40").replace(/\/$/, "");
        const images = await Promise.all([...new Set(countries)].map(async (CCode) => {
            const file = `flag-${CCode}`;
            if (this.map.hasImage(file)) return null;
            const code = CCode.trim().toLowerCase();
            if (!/^[a-z0-9_-]+$/.test(code)) return null;
            // An explicit path uses that source only. Legacy configurations retain the local fallback.
            const urls = Conf.icon?.flagPath !== undefined
                ? [`${flagPath}/${code}.png`]
                : [`${flagPath}/${code}.png`, `./flags/w40/${code}.png`];
            for (const url of urls) {
                try {
                    const image = await this.map.loadImage(url);
                    return { file, image: image.data };
                } catch (err) {
                    console.warn("addCountryFlagsImage: failed", url);
                }
            }
            return null;
        }));
        for (const result of images) {
            if (result && !this.map.hasImage(result.file)) this.map.addImage(result.file, result.image);
        }
    }

    addIndoor(data, target, selectedLevel) {
        if (!Conf.indoor?.use || !Conf.osm?.[target]) return;

        const level = String(selectedLevel ?? Conf.indoor.defaultLevel ?? "0");
        const configuredMinZoom = cMapMaker.indoorRenderMinZoom;
        const minZoom = configuredMinZoom !== null && Number.isFinite(Number(configuredMinZoom))
            ? Number(configuredMinZoom) : (cMapMaker.getPoiZoom(target) ?? 18);
        const configuredFloorHeight = Number(Conf.indoor.floorHeightMeters);
        const configuredFloorOffset = Number(Conf.indoor.floorOffsetMeters);
        const floorHeight = Number.isFinite(configuredFloorHeight) && configuredFloorHeight >= 0 ? configuredFloorHeight : 3.66;
        const floorOffset = Number.isFinite(configuredFloorOffset) ? configuredFloorOffset : 0.2;
        // 部屋や通路の線は床スラブではなく、その階の空間中央に置く。
        // OSM level=0（1F）なら階高3.66mの中央、level=9（10F）なら
        // 9階分 + 半階分として、背景建物との見た目を近似する。
        const indoorFeatures = data?.features ?? [];
        const numericFeatureLevels = indoorFeatures.flatMap(feature =>
            cMapMaker.getIndoorFeatureLevels(feature).map(Number).filter(Number.isInteger));
        const buildingHighestLevels = [...(cMapMaker.indoorBuildingLevelRanges?.values?.() ?? [])]
            .map(range => Number(range?.max)).filter(Number.isInteger);
        const numericLevel = level === "roof"
            ? Math.max(0, ...numericFeatureLevels, ...buildingHighestLevels) + 1
            : Number(level);
        const floorCenterOffset = Number.isFinite(numericLevel) && numericLevel >= 0 ? floorHeight / 2 : 0;
        const baseElevation = Math.max(0, floorOffset
            + (Number.isFinite(numericLevel) ? numericLevel * floorHeight : 0)
            + floorCenterOffset);
        const elevation = baseElevation * 2;
        const features = indoorFeatures.filter(feature => {
            // 建物形状は階層モードの判定には利用するが、地図上には描画しない。
            if (cMapMaker.isIndoorBuildingFeature(feature)) return false;
            return cMapMaker.getIndoorFeatureLevels(feature).includes(level);
        });
        const floorData = { type: "FeatureCollection", features };
        const anchor = this.getIndoorOverlayAnchor(floorData);
        const sourceId = `${target}-floor`;
        const source = this.map.getSource(sourceId);
        if (source) {
            source.setData(floorData);
            const layerIds = this.indoorLayerStates.get(target)?.layerIds;
            if (layerIds) {
                this.indoorLayerStates.set(target, { layerIds, elevation, anchor });
                Object.values(layerIds).forEach(layerId => {
                    if (this.map.getLayer(layerId)) this.map.setLayerZoomRange(layerId, minZoom, 24);
                });
                this.updateIndoorOverlayElevation();
            }
            return;
        }

        const styles = Conf.osm[target].expression.styles ?? {};
        const room = styles.room ?? {};
        const area = styles.area ?? {};
        const corridor = styles.corridor ?? {};
        const wall = styles.wall ?? {};
        const door = styles.door ?? {};
        const layerIds = {
            line: `${target}-floor-lines`,
            point: `${target}-floor-points`,
            text: `${target}-floor-text`
        };
        this.indoorLayerStates.set(target, { layerIds, elevation, anchor });

        this.map.addSource(sourceId, { type: "geojson", data: floorData, promoteId: "id" });
        this.map.addLayer({
            id: layerIds.line,
            type: "line",
            source: sourceId,
            minzoom: minZoom,
            filter: ["!", ["has", "building"]],
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
                "line-color": ["case",
                    ["==", ["get", "highway"], "corridor"], corridor["highway-stroke"] ?? "#2563a8",
                    ["match", ["get", "indoor"],
                        "wall", wall.stroke ?? "#4b5563",
                        "corridor", corridor.stroke ?? "#9aa0a6",
                        "area", area.stroke ?? "#789478",
                        room.stroke ?? "#8b7965"
                    ]
                ],
                "line-width": ["case",
                    ["==", ["get", "highway"], "corridor"], corridor["highway-stroke-width"] ?? 3,
                    ["match", ["get", "indoor"],
                        "wall", wall["stroke-width"] ?? 2.5,
                        1
                    ]
                ],
                "line-opacity": 0.95,
                "line-translate-anchor": "viewport"
            }
        });
        this.map.addLayer({
            id: layerIds.point,
            type: "circle",
            source: sourceId,
            minzoom: minZoom,
            filter: ["all",
                ["==", ["geometry-type"], "Point"],
                ["any",
                    ["has", "door"],
                    ["==", ["get", "indoor"], "door"]
                ]
            ],
            paint: {
                "circle-radius": door.radius ?? 3.5,
                "circle-color": door.color ?? "#2563a8",
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1,
                "circle-translate-anchor": "viewport"
            }
        });
        this.map.addLayer({
            id: layerIds.text,
            type: "symbol",
            source: sourceId,
            minzoom: minZoom,
            // PointのPOI名はマーカーレイヤー側で表示するため、ここでは重ねて描画しない。
            // 通路・部屋など線／面の名称は従来どおり屋内レイヤーで表示する。
            filter: ["all",
                ["!=", ["geometry-type"], "Point"],
                ["any", ["has", "name"], ["has", "ref"]]
            ],
            layout: {
                "text-field": ["coalesce", ["get", "name"], ["get", "ref"], ""],
                "text-font": Conf.map.textFont,
                "text-size": Conf.map.textSize,
                "text-anchor": "center",
                "text-padding": 2,
                "text-allow-overlap": false
            },
            paint: {
                "text-color": "#1f2937",
                "text-halo-color": "#ffffff",
                "text-halo-width": 1.5,
                "text-translate-anchor": "viewport"
            }
        });

        this.updateIndoorOverlayElevation();
        if (!this.indoorElevationEventsBound) {
            this.map.on("move", () => this.updateIndoorOverlayElevation());
            this.indoorElevationEventsBound = true;
        }

    }

    getIndoorOverlayAnchor(floorData) {
        if (!floorData?.features?.length || typeof turf === "undefined" || typeof turf.bbox !== "function") return null;
        try {
            // floorDataはrenderTagsで描画対象だけに絞り込み済み。
            const drawableFeatures = floorData.features;
            if (drawableFeatures.length === 0) return null;
            const [west, south, east, north] = turf.bbox({
                type: "FeatureCollection",
                features: drawableFeatures
            });
            if (![west, south, east, north].every(Number.isFinite)) return null;
            return [(west + east) / 2, (south + north) / 2];
        } catch (error) {
            console.warn("Maplibre: Failed to calculate indoor overlay anchor.", error);
            return null;
        }
    }

    getIndoorElevationTranslate(elevation, anchor) {
        if (!Number.isFinite(elevation) || elevation <= 0) return [0, 0];

        const reference = anchor ?? this.map.getCenter();
        const groundPoint = this.map.project(reference);
        // 標準の線・円・文字レイヤーは2D平行移動しかできない。
        // 内部3D投影値を使うと回転中に過大な横移動が発生するため、
        // 上方向だけを階高に応じて動かし、画面内の位置による遠近差だけを補正する。
        const latitudeRadians = Number(reference.lat ?? reference[1]) * Math.PI / 180;
        const worldSize = 512 * Math.pow(2, this.map.getZoom());
        const metersPerPixel = 40075016.68557849 * Math.cos(latitudeRadians) / worldSize;
        const pitchRadians = this.map.getPitch() * Math.PI / 180;
        if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return [0, 0];

        const centerPoint = this.map.project(this.map.getCenter());
        const containerHeight = this.map.getContainer()?.clientHeight ?? 0;
        const cameraDistance = Math.max(1, containerHeight * 1.5);
        const depth = cameraDistance + (groundPoint.y - centerPoint.y) * Math.sin(pitchRadians);
        const perspective = Math.min(1.35, Math.max(0.75,
            cameraDistance / Math.max(cameraDistance * 0.5, depth)));
        // 60度で現在の高さを維持し、それ未満では建物より上へ飛びすぎないよう
        // 傾斜角に比例して追加減衰させる（40度なら 40/60）。
        const pitchCorrection = Math.min(1, Math.max(0, this.map.getPitch() / 60));
        const stableOffset = (elevation / metersPerPixel) * Math.sin(pitchRadians)
            * perspective * pitchCorrection;
        if (!Number.isFinite(stableOffset) || stableOffset <= 0) return [0, 0];

        return [0, -stableOffset];
    }

    updateIndoorOverlayElevation() {
        if (!this.map || this.indoorLayerStates.size === 0) return;
        this.indoorLayerStates.forEach(({ layerIds, elevation, anchor }) => {
            const translate = this.getIndoorElevationTranslate(elevation, anchor);
            if (this.map.getLayer(layerIds.line)) this.map.setPaintProperty(layerIds.line, "line-translate", translate);
            if (this.map.getLayer(layerIds.point)) this.map.setPaintProperty(layerIds.point, "circle-translate", translate);
            if (this.map.getLayer(layerIds.text)) this.map.setPaintProperty(layerIds.text, "text-translate", translate);
        });
    }

    // Keep configured area overlays behind roads, buildings and POI layers.
    moveAreaBehindFeatures(target) {
        const expression = Conf.osm[target]?.expression;
        if (!expression?.belowFeatures && !expression?.beforeLayer) return;
        const areaIds = ["-fills", "-lines", "-points", "-text", "-icon"]
            .map(suffix => target + suffix);
        const layers = this.map.getStyle().layers || [];
        const before = expression.beforeLayer
            ? layers.find(layer => layer.id === expression.beforeLayer)
                ?? layers.find(layer => layer.type === 'symbol'
                    && !areaIds.includes(layer.id) && Conf.osm[layer.source])
            : layers.find(layer =>
            !areaIds.includes(layer.id) &&
            !["background", "raster", "hillshade", "fill"].includes(layer.type)
        );
        for (const id of areaIds) {
            if (this.map.getLayer(id)) this.map.moveLayer(id, before?.id);
        }
    }

    isPolygonSourceCurrent(target, dataRevision) {
        return dataRevision !== undefined
            && this.geojsonSourceRevisions.get(target) === dataRevision
            && this.map.getSource(target) !== undefined;
    }

    addPolygon(data, target, titleTag, dataRevision) {
        //console.log("geolib: addPolygon: " + target)
        let source = this.map.getSource(target)
        if (source !== undefined) {
            if (this.isPolygonSourceCurrent(target, dataRevision)) return;
            source.setData(data);       // 2回目以降の呼び出しはデータ設定のみ
        } else if (Conf.osm[target] !== undefined) {
            let exp = Conf.osm[target].expression;
            let zoom = cMapMaker.getPoiZoom(target)
            this.map.addSource(target, { "type": "geojson", "data": data });
            this.map.addLayer({
                'id': target + "-lines", 'type': 'line', 'source': target,
                'layout': { 'line-cap': 'round', 'line-join': 'round' },
                'paint': { 'line-color': exp.stroke, 'line-width': exp["stroke-width"], 'line-opacity': exp["fill-opacity"] }
            });
            if (zoom !== undefined) this.map.setLayerZoomRange(target + '-lines', zoom, 23);

            if (Conf.map.textSize > 0) {        // fontsizeが0より上の場合
                mapLibre.map.addLayer({
                    id: target + "-text", type: 'symbol', source: target,
                    layout: {
                        "text-field": titleTag,             // 指定されたルールに沿う
                        "text-font": Conf.map.textFont,     // 使用可能なフォント（spriteに依存）
                        "text-size": Conf.map.textSize,
                        "text-anchor": "center",            // テキストの位置（上、中央、下など）
                        'symbol-placement': 'point', 'symbol-sort-key': 1,
                        'text-allow-overlap': true, 'text-ignore-placement': true,
                        'text-offset': [0, 1]
                    },
                    paint: { "text-color": "#000000", "text-halo-color": "#ffffff", "text-halo-width": 2 }
                })
                if (zoom !== undefined) this.map.setLayerZoomRange(target + '-text', zoom, 23)
            }

            let icon = Conf.osm[target].expression.imageIcon
            let size = Conf.osm[target].expression.imageSize
            if (icon !== undefined) {
                mapLibre.map.addLayer({
                    id: target + "-icon", type: 'symbol', source: target, minzoom: 12,
                    layout: {
                        'icon-anchor': 'top-left',
                        'symbol-placement': 'point', 'symbol-sort-key': 0, "icon-offset": [-80, -50],
                        'icon-allow-overlap': true, 'icon-ignore-placement': true,
                        'icon-image': icon, 'icon-size': size == undefined ? 1 : size,
                    }
                })
            }

            this.map.addLayer({
                'id': target + "-fills", 'type': 'fill', 'source': target, 'filter': ['==', '$type', 'Polygon'],
                'paint': { 'fill-color': exp.stroke, 'fill-opacity': exp["fill-opacity"] }
            });
            if (zoom !== undefined) this.map.setLayerZoomRange(target + '-fills', zoom, 23)
            if (!exp.poiView) {         // アイコン非表示のポイントはCircle表示
                this.map.addLayer({
                    id: target + '-points', type: 'circle', source: target,
                    filter: ['==', '$type', 'Point'], // ★ポイントだけ抽出
                    minzoom: 12,
                    paint: {
                        'circle-radius': [
                            'interpolate', ['linear'], ['zoom'],
                            12, exp["stroke-width"] / 2,
                            16, exp["stroke-width"],
                            20, exp["stroke-width"] * 2
                        ],
                        'circle-color': exp.stroke,
                        'circle-opacity': exp["fill-opacity"]
                    }
                });
                if (zoom !== undefined) this.map.setLayerZoomRange(target + '-points', zoom, 23);
            }
        }
        if (dataRevision !== undefined) this.geojsonSourceRevisions.set(target, dataRevision);
        this.moveAreaBehindFeatures(target);
    }
}
