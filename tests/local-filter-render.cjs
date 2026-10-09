const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const calls = [];
const stub = class {};
const context = { console, Date, window: {navigator:{language:'ja'}},
    Conf: {}, document:{getElementById:()=>null},
    IndoorControl:stub, Glottologist:stub, Basic:stub, PoiStatusCont:stub,
    OverPassControl:stub, Maplibre:stub, GeoCont:stub, PoiCont:stub,
    GoogleSpreadSheet:stub, NewsTicker:stub, HistoricalNewsController:stub,
    ChangeController:stub, AreaFeatureLinker:stub, ListActionButtons:stub,
    PlaygroundModelFactories: {}, MapFeature3D:class{sync(){calls.push(['models']);}},
    AreaSearchController:class{renderSummary(){calls.push(['summary']);}},
    ListTable:class{
        makeList(render){calls.push(['list',render]);}
        filterByPoiStatus(visit,favorite,render){calls.push(['filter',visit,favorite,render]);}
        renderList(){calls.push(['render']);}
        getSelCategory(){return ['tags','amenity.bench'];}
    }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('cmapmaker.js','utf8')+'\nthis.maker=cMapMaker;',context);
context.Conf={thumbnail:{use:true}};
const maker=context.maker;
maker.updateView=()=>{throw new Error('Personal filter must not fetch');};
maker.makeImages=()=>calls.push(['images']);maker.viewArea=()=>calls.push(['areas']);
maker.viewPoi=targets=>calls.push(['markers',...targets]);
maker.setVisitedFilter('unvisited');
assert.equal(maker.visitedFilterStatus,'unvisited');
assert.equal(calls.filter(call=>call[0]==='render').length,1);
assert.deepEqual(calls.find(call=>call[0]==='markers'),['markers','tags','amenity.bench']);
calls.length=0;maker.toggleFavoriteFilter(true);
assert.equal(maker.favoriteFilter,true);
assert.deepEqual(calls.find(call=>call[0]==='filter'),['filter','unvisited',true,false]);
assert.equal(calls.filter(call=>call[0]==='render').length,1);
console.log('PASS: personal filters redraw existing data once without updateView/network');
