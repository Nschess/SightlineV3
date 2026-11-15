(function(){
'use strict';
var KEY='sl-intro-seen-v1',el=document.getElementById('sl-intro');
if(!el)return;
var cards=[
 ['01 / 05','Sightline','Tactical operations. One squad. One chance.'],
 ['02 / 05','Choose your mission','Tactical, Free-for-All, Bomb Defusal, Outbreak or Infection.'],
 ['03 / 05','Build your loadout','Firearms, finishes and optics, tuned your way.'],
 ['04 / 05','Pick your operative','Ten playable identities, each with their own look.'],
 ['05 / 05','Deploy','When you are ready, press Deploy. Your squad is waiting.']
],DUR=3000;
var card=el.querySelector('.si-card'),kick=card.querySelector('.si-kicker'),h2=card.querySelector('h2'),p=card.querySelector('p'),
 dots=el.querySelector('.si-dots'),begin=document.getElementById('si-begin'),skip=document.getElementById('si-skip');
for(var d=0;d<cards.length;d++)dots.appendChild(document.createElement('i'));
var timer=0,idx=-1,isOpen=false,returnFocus=null;
function seen(){try{return localStorage.getItem(KEY)==='1';}catch(e){return false;}}
function mark(){try{localStorage.setItem(KEY,'1');}catch(e){}}
function render(){
 var c=cards[idx];kick.textContent=c[0];h2.textContent=c[1];p.textContent=c[2];
 card.classList.remove('play');void card.offsetWidth;card.classList.add('play');
 var n=dots.children;for(var k=0;k<n.length;k++)n[k].className=k===idx?'on':'';
}
function next(){clearTimeout(timer);idx++;if(idx>=cards.length){close();return;}render();timer=setTimeout(next,DUR);}
function startCards(){el.setAttribute('data-phase','cards');idx=-1;next();skip.focus();}
function open(){
 if(isOpen)return;isOpen=true;returnFocus=document.activeElement;
 el.setAttribute('data-phase','splash');el.hidden=false;el.classList.remove('si-out');
 requestAnimationFrame(function(){requestAnimationFrame(function(){el.classList.add('si-in');});});
 begin.focus();
}
function close(){
 if(!isOpen)return;clearTimeout(timer);mark();el.classList.add('si-out');el.classList.remove('si-in');
 setTimeout(function(){el.hidden=true;el.classList.remove('si-out');isOpen=false;
  try{if(returnFocus&&returnFocus.focus)returnFocus.focus();}catch(e){}},650);
}
begin.addEventListener('click',startCards);
skip.addEventListener('click',close);
el.querySelector('.si-cards').addEventListener('click',function(){if(el.getAttribute('data-phase')==='cards')next();});
document.addEventListener('keydown',function(e){
 if(!isOpen)return;
 e.stopPropagation();
 if(e.key==='Escape'){e.preventDefault();close();}
 else if(e.key==='ArrowRight'&&el.getAttribute('data-phase')==='cards'){e.preventDefault();next();}
 else if(e.key==='Tab'){e.preventDefault();(document.activeElement===skip&&el.getAttribute('data-phase')==='splash'?begin:(document.activeElement===begin?skip:skip)).focus();}
},true);
var replay=document.getElementById('btn-intro');
if(replay)replay.addEventListener('click',open);
// auto-open once for new players, only on the lobby, never when auto-joining a LAN match
setTimeout(function(){
 var ov=document.getElementById('ov-start');
 if(seen()||/[?&]join=1/.test(location.search))return;
 if(!ov||ov.hidden)return;
 open();
},900);
})();
