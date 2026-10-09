const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const data = JSON.parse(fs.readFileSync('data/expo2025.min.json', 'utf8'));
const codes = [...new Set(data.elements.flatMap(element =>
    (element.tags?.country ?? '').split(';').map(code => code.trim()).filter(Boolean)))];
for (const code of codes) {
    const file = fs.readFileSync(`flags/w40/${code.toLowerCase()}.png`);
    assert.equal(file.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', code);
    assert.ok(file.readUInt32BE(16) > 0 && file.readUInt32BE(20) > 0, code);
}

const loaded = [], registered = new Set();
const context = { Conf: { icon: { flagPath: './flags/w40/' } }, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync('lib/maplib.js', 'utf8') + '\nthis.flags = new Maplibre()', context);
context.flags.map = {
    hasImage: name => registered.has(name),
    loadImage: async url => { loaded.push(url); return { data: {} }; },
    addImage: name => registered.add(name)
};

(async () => {
    await context.flags.addCountryFlagsImage([...codes, codes[0]]);
    assert.equal(registered.size, codes.length);
    assert.equal(loaded.length, codes.length);
    assert.ok(loaded.every(url => url.startsWith('./flags/w40/')));
    assert.ok(loaded.includes('./flags/w40/asean.png'));
    assert.ok(loaded.includes('./flags/w40/eu.png'));
    await context.flags.addCountryFlagsImage(codes);
    assert.equal(loaded.length, codes.length, 'registered flags must not be fetched again');

    context.Conf.icon = {};
    context.flags.map.loadImage = async url => {
        loaded.push(url);
        if (url.startsWith('https:')) throw new Error('CDN unavailable');
        return { data: {} };
    };
    await context.flags.addCountryFlagsImage(['UN']);
    assert.deepEqual(loaded.slice(-2), ['https://flagcdn.com/w40/un.png', './flags/w40/un.png']);
    assert.ok(registered.has('flag-UN'));
    console.log(`PASS: all ${codes.length} country flags are bundled; local loading, deduplication and legacy fallback`);
})().catch(error => { console.error(error); process.exitCode = 1; });
