const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { Map, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync('lib/maplib.js', 'utf8') + '\nthis.lib = new Maplibre();', context);

const expression = context.lib.nameExpression('en', [['get', 'ref'], '']);
assert.deepEqual(JSON.parse(JSON.stringify(expression)), [
    'coalesce', ['get', 'name:en'], ['get', 'name'], ['get', 'ref'], ''
]);

console.log('maplib name expression: ok');
