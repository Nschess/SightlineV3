'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
// The current authoritative host page and map registry live in the Android
// phone-host asset bundle; there is no project-root index.html/data.json.
const hostAssets=path.resolve(__dirname,'../../AndroidProject/app/src/main/assets/phone-host');
const html=fs.readFileSync(path.join(hostAssets,'index.html'),'utf8');
test('game identity, save namespaces and map identifiers are unchanged',()=>{
 assert.match(html,/sightline\.settings\.v1/);
 const ids=JSON.parse(fs.readFileSync(path.join(hostAssets,'data.json'))).maps.map(m=>m.id);
 const expected=['courtyard','dune','foundry','oldtown','yard','saltpan','kagay','divisoria','cathedral','gorge','overpass','bridge','park','divisoria_district','macasandig_riverside','uptown_ridge','horror_city','blackwater_old_quarter','meridian_labyrinth','floodline_district','switchyard_nine','ridgefall_outpost'];
 assert.deepEqual(ids,expected);assert.equal(ids.length,22);
});
test('lobby settings use five accessible categories and avoid sticky overlay collisions',()=>{
 assert.match(html,/role="tablist" aria-label="Settings category"/);
 assert.match(html,/var SET_TABS = \[\['video', 'Graphics'\], \['audio', 'Audio'\], \['controls', 'Controls'\], \['play', 'Gameplay'\], \['network', 'Network'\]\]/);
 assert.match(html,/tabindex="' \+ \(s\[0\] === setTab \? '0' : '-1'\)/);
 assert.match(html,/setTab = b.getAttribute\('data-sub'\); SL82_SETTINGS_SUBROUTE='settings'; renderBody\(false\); renderNav\(\); var chosen/);
 assert.match(html,/#ov-start \.subtabs \{ position:relative; top:auto; z-index:1;/);
 assert.match(html,/#pn-dyn \.subtabs button \{min-height:38px/);
 assert.match(html,/#ov-start \.subtabs button \{ min-height:40px/);
 assert.match(html,/@media \(prefers-reduced-motion:reduce\)/);
});
test('changing settings category by click rerenders once and focuses newly selected tab',()=>{
 const a=html.indexOf("$('.mn-main').addEventListener('click'"),b=html.indexOf("$('.mn-main').addEventListener('input'",a);
 assert(a>=0&&b>a);let click,renderN=0,navN=0,focused=0,tick=0;
 const chosen={focus(o){assert.equal(o.preventScroll,true);focused++}};
 const ctx=vm.createContext({$:(sel)=>sel==='.mn-main'?{addEventListener(event,fn){if(event==='click')click=fn}}:chosen,
   renderBody(v){assert.equal(v,false);renderN++},renderNav(){navN++},uiTick(v){assert.equal(v,true);tick++},setTab:'video',SL82_SETTINGS_SUBROUTE:'settings',console});
 vm.runInContext(html.slice(a,b),ctx);
 const target={closest(sel){return sel==='[data-sub]'?{getAttribute(k){assert.equal(k,'data-sub');return 'audio'}}:null}};
 click({target});assert.equal(ctx.setTab,'audio');assert.equal(ctx.SL82_SETTINGS_SUBROUTE,'settings');assert.equal(renderN,1);assert.equal(navN,1);assert.equal(focused,1);assert.equal(tick,1);
});
