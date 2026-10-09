const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = vm.createContext({
    console,
    turf: {
        bboxPolygon: bbox => ({ bbox }),
        booleanIntersects: (feature, viewport) => {
            const xs = feature.geometry.coordinates.flat(Infinity).filter((_, index) => index % 2 === 0);
            const ys = feature.geometry.coordinates.flat(Infinity).filter((_, index) => index % 2 === 1);
            const featureBbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
            const [west, south, east, north] = viewport.bbox;
            return featureBbox[0] <= east && featureBbox[2] >= west
                && featureBbox[1] <= north && featureBbox[3] >= south;
        }
    }
});
vm.runInContext(fs.readFileSync('lib/geolib.js', 'utf8') + '\nthis.GeoContClass = GeoCont;', context);
const geo = new context.GeoContClass();
const viewport = { NW: { lng: 135.512, lat: 34.739 }, SE: { lng: 135.514, lat: 34.737 } };
const park = {
    type: 'Feature',
    geometry: {
        type: 'Polygon',
        coordinates: [[[135.51, 34.735], [135.516, 34.735], [135.516, 34.741], [135.51, 34.741], [135.51, 34.735]]]
    }
};

assert.equal(geo.checkInner([135.51, 34.735], viewport), false);
assert.equal(geo.checkFeatureInner(park, [135.51, 34.735], viewport), true);
assert.equal(geo.checkFeatureInner({ geometry: { type: 'Point' } }, [135.513, 34.738], viewport), true);
assert.equal(geo.checkFeatureInner({ geometry: { type: 'Point' } }, [135.51, 34.735], viewport), false);
console.log('PASS: intersecting park remains visible when its representative point is outside the viewport');
