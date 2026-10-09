const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.classList={toggle(){},add(){},remove(){}};}
 append(...items){this.children.push(...items);}
 appendChild(item){this.append(item);return item;}
 replaceChildren(...items){this.children=items;}
 setAttribute(key,value){this[key]=value;}
 addEventListener(type,handler){(this.listeners??={})[type]=handler;}
 focus(){}
 querySelectorAll(selector){const found=[];const walk=node=>{if(node.className==='changes-modal__item')found.push(node);node.children?.forEach(walk);};walk(this);return found;}
}
const values=new Map();let requests=0,observer;
const context={Date,console,document:{createElement:tag=>new Element(tag),body:new Element('body')},
 window:{localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},matchMedia:()=>({matches:true}),requestAnimationFrame:callback=>callback()},
 mapLibre:{getUserLocation:()=>null,map:{getCenter:()=>({lng:135,lat:34})}},
 bootstrap:{Modal:{getOrCreateInstance:element=>({show(){element.listeners['show.bs.modal']?.();element.listeners['shown.bs.modal']?.();},hide(){element.listeners['hidden.bs.modal']?.();}})}},
 IntersectionObserver:class{constructor(callback,options){this.callback=callback;this.options=options;observer=this;}observe(){}disconnect(){}},
 fetch:()=>{requests++;throw new Error('Unexpected request');},
 getWikimedia:()=>{requests++;throw new Error('Unexpected image metadata request');}};
vm.createContext(context);vm.runInContext(fs.readFileSync('lib/newstickerview.js','utf8')+'\nthis.Ticker=NewsTicker',context);
const ticker=new context.Ticker();
const events=[
 {name:'A',osmId:'node/1',placeId:'way/10',activityId:'review/1',timestamp:100,kind:'reviewCreated',coordinates:[135,34],section:'other'},
 {name:'A',osmId:'node/2',placeId:'way/10',activityId:'review/2',timestamp:200,kind:'reviewUpdated',coordinates:[135,34],section:'favorite'},
 {name:'B',osmId:'way/20',timestamp:300,kind:'regionalUpdated',coordinates:[136,35],section:'other'}
];
ticker.init(new Element('div'),{modal:true,groupByPlace:true,seenStorageKey:'sample.seen',itemsProvider:()=>events});
ticker.setItems([...events,events[0]]);
assert.equal(ticker.unreadEvents().length,3);assert.equal(values.size,0);
const groups=ticker.eventGroups();assert.equal(groups.length,2);assert.equal(groups[0].events.length,2);assert.equal(groups[0].section,'favorite');
(async()=>{
 ticker.markEventsSeen([events[1]]); // The group's newest update was already read, but its hidden child was not.
 await ticker.toggle();assert.equal(ticker.unreadEvents().length,2); // Opening alone is not reading all entries.
 ticker.createChangeItem({...events[0],thumbnail:'File:NotResolved.jpg'});
 assert.equal(requests,0); // Feed display must not resolve extra Wikimedia metadata.
 const displayed=ticker.content.querySelectorAll('.changes-modal__item');
 assert.equal(displayed.length,2); // Hidden group members are not instantiated yet.
 assert.ok(displayed[0].children[0].children.some(node=>node.className==='change-feed-unread'));
 observer.callback([{target:displayed[0],isIntersecting:true,intersectionRatio:1},{target:displayed[1],isIntersecting:false,intersectionRatio:0}]);
 assert.equal(ticker.unreadEvents().length,1);
 assert.equal(ticker.unreadEvents([events[0]]).length,0); // Viewing a summary reads the updates it represents.
 assert.equal(ticker.unreadEvents([events[2]]).length,1); // An offscreen group remains unread.
 observer.callback([{target:displayed[1],isIntersecting:true,intersectionRatio:0.2}]);
 assert.equal(ticker.unreadEvents().length,1); // A sliver at the edge is not enough.
 observer.callback([{target:displayed[1],isIntersecting:true,intersectionRatio:1}]);
 assert.equal(ticker.unreadEvents().length,0); // Scrolling through the cards clears all unread updates.
 const section=ticker.content.children[1];const details=section.children[1].children[1];
 details.open=true;details.listeners.toggle();
 assert.equal(ticker.content.querySelectorAll('.changes-modal__item').length,3);
 ticker.markEventsSeen(events);assert.equal(ticker.unreadEvents().length,0);
 ticker.setItems([...events,{...events[0],timestamp:400}]);assert.equal(ticker.unreadEvents().length,1);
 const other=new context.Ticker();other.config={seenStorageKey:'sample.seen'};other.currentEvents=events;assert.equal(other.unreadEvents().length,0);
 context.window.localStorage.getItem=()=>{throw new Error('Denied');};context.window.localStorage.setItem=()=>{throw new Error('Denied');};
 assert.doesNotThrow(()=>ticker.markEventsSeen(events));assert.equal(requests,0);
 console.log('PASS: place grouping, individual updates, visible-only reading, persisted timestamps and zero panel requests');
})().catch(error=>{console.error(error);process.exitCode=1;});
