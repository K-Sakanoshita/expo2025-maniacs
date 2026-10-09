const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const labels = Object.assign({},
    vm.runInNewContext('(' + fs.readFileSync('data/glot-system.jsonc', 'utf8') + ')'),
    vm.runInNewContext('(' + fs.readFileSync('data/glot-custom.jsonc', 'utf8') + ')'));
const context = { poiCont: { getCatnames: () => ['トイレ', ''] },
    glot: { lang: 'ja', get(key) { return labels[key]?.[this.lang] || key; } }, Conf: { etc: { localSave: '' } },
    cMapMaker: {}, basic: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('detail/osmbasic.js', 'utf8') + '\nthis.OSMbasic = OSMbasic', context);
const detail = new context.OSMbasic();
const yesNo = detail.make({ amenity: 'toilets', female: 'no', male: 'yes',
    unisex: 'yes', 'capacity:men': '3', 'capacity:unisex': '1',
    wheelchair: 'limited', changing_table: 'no' });
assert.match(yesNo, /女性用 なし/);
assert.match(yesNo, /男性用 3/);
assert.match(yesNo, /共用 1/);
assert.match(yesNo, /車いす一部対応/);
assert.match(yesNo, /おむつ交換台なし/);
const unknown = detail.make({ amenity: 'toilets' });
assert.match(unknown, /詳細情報は未登録/);
assert.match(detail.make({ amenity: 'toilets', wheelchair: 'no', changing_table: 'yes' }), /車いす非対応/);
assert.match(detail.make({ amenity: 'toilets', wheelchair: 'yes', changing_table: 'yes' }), /おむつ交換台あり/);
assert.doesNotMatch(unknown, /女性用 なし/);
console.log('PASS: toilet yes/no/capacity and unknown distinction');

context.glot.lang = 'en';
context.poiCont.getCatnames = () => ['Restroom', ''];
const english = detail.make({ amenity: 'toilets', female: 'no', male: 'yes',
    unisex: 'yes', 'capacity:men': '3', 'capacity:unisex': '1',
    wheelchair: 'limited', changing_table: 'no' });
assert.match(english, /Women None/);
assert.match(english, /Men 3/);
assert.match(english, /Unisex 1/);
assert.match(english, /Limited wheelchair access/);
assert.match(english, /No baby changing table/);
assert.doesNotMatch(english, /[ぁ-んァ-ヶ一-龯]/);
assert.match(detail.make({ amenity: 'toilets' }), /details are not recorded/);
console.log('PASS: English toilet details and unknown distinction');
