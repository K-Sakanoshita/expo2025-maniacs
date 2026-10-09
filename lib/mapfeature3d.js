"use strict";

// Configuration-driven MapLibre/Three.js overlay for arbitrary tagged map features.
// Model factories and application interaction callbacks are supplied by the caller.
class MapFeature3D {
    constructor(dependencies = {}) {
        this.modelFactories = new Map(Object.entries(dependencies.modelFactories ?? {})
            .filter(([type, factory]) => type !== "gltf" && typeof factory === "function"));
        this.getFeatureLabel = dependencies.getFeatureLabel ?? (id => String(id));
        this.getSelectionTitle = dependencies.getSelectionTitle ?? (() => "Select a feature");
        this.onSelect = dependencies.onSelect ?? (() => {});
        this.map = null;
        this.THREE = null;
        this.GLTFLoader = null;
        this.loader = null;
        this.scene = null;
        this.modelGroup = null;
        this.camera = null;
        this.renderer = null;
        this.raycaster = null;
        this.sceneOrigin = null;
        this.templates = new Map();
        this.ready = false;
        this.loading = null;
        this.layerId = "map-feature-3d";
        this.pendingSync = false;
        this.enabled = false;
        this.cursorOwned = false;
        this.visibleFeatures = [];
        this.renderedIds = new Set();
        this.lastSyncKey = "";
        this.hoverFrame = null;
        this.hoverEvent = null;
        this.overlapHandledEvents = new WeakSet();
        this.hitArea = { use: true, padding: 0.35, minSize: 1.2 };
        this.visualScale = 1.2;

        this.modelDefs = {};
        this.rules = [];
    }

    init(map, options = {}) {
        if (!map) return Promise.resolve(false);
        if (this.loading) return this.loading;

        this.configure(options);
        if (!this.enabled || this.rules.length === 0) return Promise.resolve(false);

        this.map = map;
        this.loading = this.#loadThree()
            .then(() => Promise.all(
                Object.entries(this.modelDefs)
                    .filter(([, def]) => def.type === "gltf")
                    .map(([key, def]) => this.#loadTemplate(key, def))
            ))
            .then(() => {
                this.#createProceduralTemplates();
                this.ready = true;
                this.#ensureLayer();
                this.map.on("style.load", () => {
                    this.#ensureLayer();
                    this.pendingSync = true;
                    setTimeout(() => this.sync(), 0);
                });
                this.map.on("click", e => this.#onClick(e));
                if (this.supportsHoverInteraction()) {
                    this.map.on("mousemove", e => this.#scheduleMouseMove(e));
                }
                if (this.pendingSync) this.sync();
                return true;
            })
            .catch(err => {
                console.warn("MapFeature3D: initialization failed", err);
                return false;
            });

        return this.loading;
    }

    // Configuration is read once during startup; reload the page after editing it.
    configure(options = {}) {
        this.enabled = options.use === true;
        this.modelDefs = {};
        this.rules = [];
        const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
        const hitArea = isObject(options.hitArea) ? options.hitArea : {};
        const positiveNumber = (value, fallback) =>
            typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
        this.visualScale = typeof options.visualScale === "number"
            && Number.isFinite(options.visualScale) && options.visualScale > 0
            ? options.visualScale : 1.2;
        this.hitArea = {
            use: hitArea.use !== false,
            padding: positiveNumber(hitArea.padding, 0.35),
            minSize: positiveNumber(hitArea.minSize, 1.2)
        };
        const models = isObject(options.models) ? options.models : {};
        for (const [key, def] of Object.entries(models)) {
            if (!isObject(def) || def.use === false) continue;
            if (typeof def.size !== "number" || !Number.isFinite(def.size) || def.size <= 0) continue;
            const type = this.modelFactories.has(def.type) ? def.type : "gltf";
            if (type === "gltf" && (typeof def.url !== "string" || !def.url.trim())) continue;
            Object.defineProperty(this.modelDefs, key, {
                value: {
                    type,
                    ...(type === "gltf" ? { url: def.url.trim() } : {}),
                    size: def.size,
                    ...(typeof def.scaleBelowZoom === "number" && Number.isFinite(def.scaleBelowZoom)
                        ? { scaleBelowZoom: def.scaleBelowZoom } : {}),
                    ...(typeof def.maxZoomScale === "number" && Number.isFinite(def.maxZoomScale) && def.maxZoomScale >= 1
                        ? { maxZoomScale: def.maxZoomScale } : {})
                },
                enumerable: true
            });
        }
        for (const rule of Array.isArray(options.rules) ? options.rules : []) {
            if (!isObject(rule) || rule.use === false || typeof rule.model !== "string") continue;
            if (!Object.hasOwn(this.modelDefs, rule.model) || !isObject(rule.tags)) continue;
            const entries = Object.entries(rule.tags);
            if (!entries.length) continue;
            const tags = entries.map(([key, value]) => {
                const values = Array.isArray(value) ? value : [value];
                if (!key || !values.length || values.some(v => typeof v !== "string" || !v.trim())) return null;
                return [key, values.map(v => v.trim().toLowerCase())];
            });
            if (tags.some(tag => tag === null)) continue;
            this.rules.push({ model: rule.model, tags });
        }
    }

    getModelKey(tags) {
        // First matching rule wins; multiple keys are AND, array values are OR.
        return this.rules.find(rule => rule.tags.every(([key, values]) =>
            Object.hasOwn(tags, key) && values.includes(String(tags[key]).trim().toLowerCase())
        ))?.model;
    }

    getZoomScale(def, zoom) {
        if (!Number.isFinite(def?.scaleBelowZoom) || !Number.isFinite(zoom)) return 1;
        const maxScale = Number.isFinite(def.maxZoomScale) && def.maxZoomScale >= 1
            ? def.maxZoomScale : Infinity;
        return Math.min(maxScale, 2 ** Math.max(0, def.scaleBelowZoom - zoom));
    }

    supportsHoverInteraction() {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
        return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    }

    async #loadThree() {
        const [threeModule, loaderModule] = await Promise.all([
            import("https://esm.sh/three@0.169.0"),
            import("https://esm.sh/three@0.169.0/examples/jsm/loaders/GLTFLoader.js")
        ]);
        this.THREE = threeModule;
        this.GLTFLoader = loaderModule.GLTFLoader;
        this.loader = new this.GLTFLoader();
        this.raycaster = new this.THREE.Raycaster();
    }

    async #loadTemplate(key, def) {
        try {
            const gltf = await this.loader.loadAsync(def.url);
            const root = gltf.scene;
            root.updateMatrixWorld(true);

            const box = new this.THREE.Box3().setFromObject(root);
            const size = new this.THREE.Vector3();
            box.getSize(size);
            const longest = Math.max(size.x, size.y, size.z) || 1;
            const scale = (def.size * this.visualScale) / longest;

            const wrapper = new this.THREE.Group();
            root.scale.setScalar(scale);
            root.position.set(-(box.min.x + box.max.x) * scale / 2, -box.min.y * scale, -(box.min.z + box.max.z) * scale / 2);
            wrapper.add(root);
            this.#addHitArea(wrapper, size, scale);
            wrapper.userData.modelKey = key;
            this.templates.set(key, wrapper);
        } catch (err) {
            console.warn(`MapFeature3D: failed to load ${key}`, err);
        }
    }

    #createProceduralTemplates() {
        for (const [key, def] of Object.entries(this.modelDefs)) {
            const factory = this.modelFactories.get(def.type);
            if (!factory) continue;
            let root;
            try { root = factory(this.THREE, def); }
            catch (err) {
                console.warn(`MapFeature3D: failed to create ${key}`, err);
                continue;
            }
            if (!root) continue;

            const scale = def.size * this.visualScale;
            root.scale.setScalar(scale);
            root.updateMatrixWorld(true);
            const sourceSize = new this.THREE.Vector3();
            new this.THREE.Box3().setFromObject(root).getSize(sourceSize);
            const wrapper = new this.THREE.Group();
            wrapper.add(root);
            this.#addHitArea(wrapper, sourceSize, 1);
            wrapper.userData.modelKey = key;
            this.templates.set(key, wrapper);
        }
    }

    #addHitArea(wrapper, sourceSize, scale) {
        if (!this.hitArea.use) return;
        const { width, height, depth, centerY } = this.getHitAreaDimensions(sourceSize, scale);
        const geometry = new this.THREE.BoxGeometry(width, height, depth);
        const material = new this.THREE.MeshBasicMaterial({ visible: false });
        const hitArea = new this.THREE.Mesh(geometry, material);
        hitArea.name = "map-feature-3d-hit-area";
        hitArea.position.y = centerY;
        hitArea.userData.isHitArea = true;
        wrapper.add(hitArea);
    }

    getHitAreaDimensions(sourceSize, scale) {
        const padding = this.hitArea.padding;
        const modelWidth = sourceSize.x * scale;
        const modelHeight = sourceSize.y * scale;
        const modelDepth = sourceSize.z * scale;
        return {
            width: Math.max(modelWidth + padding * 2, this.hitArea.minSize),
            height: Math.max(modelHeight + padding * 2, this.hitArea.minSize),
            depth: Math.max(modelDepth + padding * 2, this.hitArea.minSize),
            centerY: modelHeight / 2
        };
    }

    #ensureLayer() {
        if (!this.ready || !this.map || this.map.getLayer(this.layerId)) return;

        const self = this;
        const customLayer = {
            id: this.layerId,
            type: "custom",
            // Three.js keeps depth testing between model parts. Treat the result as
            // a 2D map layer so later marker layers are always composited above it.
            renderingMode: "2d",
            onAdd(map, gl) {
                self.camera = new self.THREE.Camera();
                self.scene = new self.THREE.Scene();

                // Match the coordinate convention from the MapLibre Three.js terrain example:
                // x=east, y=up, z=north.
                self.scene.rotateX(Math.PI / 2);
                self.scene.scale.multiply(new self.THREE.Vector3(1, 1, -1));


                const ambient = new self.THREE.AmbientLight(0xffffff, 1.5);
                self.scene.add(ambient);

                const sun = new self.THREE.DirectionalLight(0xffffff, 2.0);
                sun.position.set(50, 80, -30).normalize();
                self.scene.add(sun);

                self.modelGroup = new self.THREE.Group();
                self.scene.add(self.modelGroup);

                self.renderer = new self.THREE.WebGLRenderer({
                    canvas: map.getCanvas(),
                    context: gl,
                    antialias: true
                });
                self.renderer.autoClear = false;
                self.pendingSync = true;
                setTimeout(() => self.sync(), 0);
            },
            onRemove() {
                self.renderer?.dispose();
                self.modelGroup = null;
                self.renderedIds.clear();
                self.lastSyncKey = "";
            },
            render(gl, args) {
                if (!self.scene || !self.sceneOrigin) return;

                const originElevation = self.#terrainElevation(self.sceneOrigin);
                const originMercator = maplibregl.MercatorCoordinate.fromLngLat(
                    self.sceneOrigin,
                    originElevation
                );
                const projection = new self.THREE.Matrix4().fromArray(
                    args.defaultProjectionData.mainMatrix
                );
                const localToMercator = new self.THREE.Matrix4()
                    .makeTranslation(originMercator.x, originMercator.y, originMercator.z)
                    .scale(new self.THREE.Vector3(
                        originMercator.meterInMercatorCoordinateUnits(),
                        -originMercator.meterInMercatorCoordinateUnits(),
                        originMercator.meterInMercatorCoordinateUnits()
                    ));

                self.camera.projectionMatrix.copy(projection.multiply(localToMercator));
                self.camera.projectionMatrixInverse.copy(self.camera.projectionMatrix).invert();
                self.renderer.resetState();
                // These models replace POI icons, so base-map buildings and fills
                // must not hide them when both occupy the same ground position.
                self.renderer.clearDepth();
                self.renderer.render(self.scene, self.camera);
            }
        };

        try {
            this.map.addLayer(customLayer);
            this.placeBelowMarkerLayers();
        } catch (err) {
            console.warn("MapFeature3D: custom layer could not be added", err);
        }
    }

    placeBelowMarkerLayers() {
        if (!this.map?.getLayer?.(this.layerId)) return false;
        const layers = this.map.getStyle?.()?.layers ?? [];
        const modelIndex = layers.findIndex(layer => layer.id === this.layerId);
        const firstMarkerIndex = layers.findIndex(layer => String(layer.id ?? "").startsWith("marker-"));
        if (modelIndex < 0 || firstMarkerIndex < 0 || modelIndex < firstMarkerIndex) return false;
        this.map.moveLayer(this.layerId, layers[firstMarkerIndex].id);
        return true;
    }

    hasModel(id) {
        return this.enabled && this.ready && this.map?.getLayer(this.layerId)
            && this.renderedIds.has(String(id));
    }

    sync(features) {
        // Accept Point GeoJSON features, or { geojson, lnglat } with a representative position.
        // The caller supplies visibility/zoom filtering shared with its other map symbols.
        if (features) this.visibleFeatures = features.map(item => {
            const geojson = item.geojson ?? item;
            const lnglat = item.lnglat ?? (geojson.geometry?.type === "Point" ? geojson.geometry.coordinates : null);
            return { geojson, lnglat };
        });
        if (!this.enabled) return;
        if (!this.ready || !this.map || !this.modelGroup) {
            this.pendingSync = true;
            return;
        }
        this.pendingSync = false;

        const center = this.map.getCenter();
        const zoom = this.map.getZoom();
        const bounds = this.map.getBounds();
        const boundsKey = typeof bounds?.toArray === "function"
            ? JSON.stringify(bounds.toArray()) : "";
        const featureKey = this.visibleFeatures.map(poi => {
            const feature = poi.geojson;
            const tags = this.#tags(feature);
            return [feature?.id ?? tags.id, poi.lnglat?.[0], poi.lnglat?.[1], this.getModelKey(tags), tags.direction].join(":");
        }).join("|");
        const syncKey = `${center.lng ?? center[0]}:${center.lat ?? center[1]}:${zoom}:${boundsKey}:${featureKey}`;
        if (this.lastSyncKey === syncKey) return;
        this.lastSyncKey = syncKey;
        this.renderedIds.clear();

        this.modelGroup.clear();

        this.sceneOrigin = center;
        const originMercator = maplibregl.MercatorCoordinate.fromLngLat(this.sceneOrigin);
        const originElevation = this.#terrainElevation(this.sceneOrigin);
        this.visibleFeatures.forEach(poi => {
            const feature = poi.geojson;
            const lnglat = poi.lnglat;
            if (!Array.isArray(lnglat) || lnglat.length < 2) return;
            if (!bounds.contains(lnglat)) return;

            const tags = this.#tags(feature);
            const rawId = feature.id ?? tags.id;
            if (rawId === undefined || rawId === null || String(rawId) === "") return;
            const featureId = String(rawId);
            const modelKey = this.getModelKey(tags);
            const template = this.templates.get(modelKey);
            if (!template) return;

            const mercator = maplibregl.MercatorCoordinate.fromLngLat(lnglat);
            const delta = this.#mercatorDeltaMeters(originMercator, mercator);
            const elevation = this.#terrainElevation(lnglat) - originElevation;
            const object = template.clone(true);
            object.position.set(delta.east, elevation, delta.north);
            object.scale.setScalar(this.getZoomScale(this.modelDefs[modelKey], zoom));

            const direction = tags.direction == null || String(tags.direction).trim() === ""
                ? NaN : Number(tags.direction);
            if (Number.isFinite(direction)) {
                object.rotation.y = this.THREE.MathUtils.degToRad(direction);
            }

            object.userData.featureId = featureId;
            object.traverse(child => {
                child.userData.featureId = featureId;
            });
            this.modelGroup.add(object);
            this.renderedIds.add(featureId);
        });

        this.map.triggerRepaint();
    }

    #tags(feature) {
        const props = feature?.properties ?? {};
        return (props.tags && typeof props.tags === "object") ? props.tags : props;
    }

    #terrainElevation(lnglat) {
        if (!this.map || typeof this.map.queryTerrainElevation !== "function") return 0;
        return this.map.queryTerrainElevation(lnglat) || 0;
    }

    #mercatorDeltaMeters(from, to) {
        const mercatorPerMeter = from.meterInMercatorCoordinateUnits();
        return {
            east: (to.x - from.x) / mercatorPerMeter,
            north: (from.y - to.y) / mercatorPerMeter
        };
    }

    #pick(point) {
        if (!this.ready || !this.camera || !this.modelGroup || this.modelGroup.children.length === 0) {
            return null;
        }
        const canvas = this.map.getCanvas();
        const ndcX = (point.x / canvas.clientWidth) * 2 - 1;
        const ndcY = -(point.y / canvas.clientHeight) * 2 + 1;
        const inv = this.camera.projectionMatrixInverse;
        const near = new this.THREE.Vector3(ndcX, ndcY, -1).applyMatrix4(inv);
        const far = new this.THREE.Vector3(ndcX, ndcY, 1).applyMatrix4(inv);
        const direction = far.clone().sub(near).normalize();
        this.raycaster.set(near, direction);
        const hits = this.raycaster.intersectObjects(this.modelGroup.children, true);
        return hits.length > 0 ? hits[0].object : null;
    }

    #findFeatureId(object) {
        let current = object;
        while (current) {
            if (current.userData?.featureId) return current.userData.featureId;
            current = current.parent;
        }
        return null;
    }

    getSelectionIds(markerId, modelId) {
        return [...new Set([markerId, modelId]
            .filter(id => id !== undefined && id !== null && String(id) !== "")
            .map(String))];
    }

    handleMarkerClick(e, markerId) {
        const modelId = this.#findFeatureId(this.#pick(e.point));
        const ids = this.getSelectionIds(markerId, modelId);
        if (ids.length < 2) return false;
        if (e.originalEvent && typeof e.originalEvent === "object") {
            this.overlapHandledEvents.add(e.originalEvent);
        }
        this.#showSelection(e.lngLat, ids);
        return true;
    }

    #showSelection(lngLat, ids) {
        const content = document.createElement("div");
        content.className = "d-grid gap-2 p-1";
        const title = document.createElement("strong");
        title.textContent = this.getSelectionTitle();
        content.appendChild(title);

        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
            .setLngLat(lngLat)
            .setDOMContent(content)
            .addTo(this.map);
        ids.forEach(featureId => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "btn btn-light border-secondary text-start";
            button.textContent = this.getFeatureLabel(featureId);
            button.addEventListener("click", () => {
                popup.remove();
                this.#selectFeature(featureId);
            });
            content.appendChild(button);
        });
    }

    #selectFeature(featureId) {
        Promise.resolve().then(() => this.onSelect(featureId))
            .catch(err => console.warn("MapFeature3D: feature selection failed", err));
    }

    #onClick(e) {
        const hit = this.#pick(e.point);
        const featureId = this.#findFeatureId(hit);
        if (!featureId) return;
        // Layer-specific marker handlers run during the same event dispatch. Delay
        // the 3D action so an overlapping marker can replace it with a chooser.
        setTimeout(() => {
            if (e.originalEvent && this.overlapHandledEvents.has(e.originalEvent)) return;
            this.#selectFeature(featureId);
        }, 0);
    }

    #onMouseMove(e) {
        if (this.map?.isMoving?.()) {
            this.#setHoverCursor(false);
            return;
        }
        const hit = this.#pick(e.point);
        this.#setHoverCursor(Boolean(hit));
    }

    #scheduleMouseMove(e) {
        this.hoverEvent = e;
        if (this.hoverFrame !== null) return;
        this.hoverFrame = requestAnimationFrame(() => {
            this.hoverFrame = null;
            const latestEvent = this.hoverEvent;
            this.hoverEvent = null;
            if (latestEvent) this.#onMouseMove(latestEvent);
        });
    }

    #setHoverCursor(active) {
        if (active) {
            this.map.getCanvas().style.cursor = "pointer";
            this.cursorOwned = true;
        } else if (this.cursorOwned) {
            this.map.getCanvas().style.cursor = "";
            this.cursorOwned = false;
        }
    }
}
