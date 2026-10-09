const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('detail/osmbasic.js', 'utf8');
assert.match(source, /setTimeout\(\(\) => \{[\s\S]*queueGetWikiMediaImage/);
assert.doesNotMatch(source, /wikimq\.forEach\(\(q\) => wikimedia\.getWikiMediaImage/);
console.log('PASS: detail Wikimedia images are queued after the detail DOM is inserted');
