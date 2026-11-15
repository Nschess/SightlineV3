import re
SRC='/home/claude/pkg/AndroidProject/app/src/main/assets/'
DST='/home/claude/work/AndroidProject/app/src/main/assets/'
L='/home/claude/work/lobby-10/'
css=open(L+'lobby10.css').read()+open(L+'intro.css').read()+open(L+'features.css').read()
intro_html=open(L+'intro.html').read(); intro_js=open(L+'intro.js').read()
mf_html=open(L+'matchfound.html').read(); feat_js=open(L+'features.js').read()
btn='<button type="button" class="lobby-intro-btn" id="btn-intro">Watch intro</button>'
def once(s,a,b,d,label):
    assert s.count(a)==1,(d,label,s.count(a)); return s.replace(a,b)
for d in ('www','phone-host'):
    s=open(SRC+d+'/index.html',encoding='utf-8').read()
    # Play panel: brief into a deploy card
    brief='<div class="mode-brief" id="mode-brief" aria-live="polite"></div>'
    s=once(s,brief,'',d,'brief')
    m=re.search(r'(<div class="lobby-deploy-row">.*?Quit to menu</button></div></div>)',s,re.S); assert m,(d,'row')
    s=s.replace(m.group(1),'<div class="lobby-nameplate" id="lobby-nameplate"></div><aside class="lobby-deploy-card" aria-label="Mission brief and deploy">'+brief+'<div class="lobby-squad" id="lobby-squad"></div>'+m.group(1)+'</aside>',1)
    ot='<p id="ov-text">Choose a mission and prepare your squad.</p>'
    s=once(s,ot,ot+btn,d,'ovtext')
    # sound toggle in the rail
    card='<div class="mn-card" id="mn-card"></div>'
    snd='<button type="button" class="mn-sound" id="mn-sound" aria-pressed="true" aria-label="Menu music" title="Menu music"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path class="w" d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path class="x" d="M17 9l5 6M22 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>'
    s=once(s,card,card+snd,d,'rail')
    # scroll preservation for the glass panel
    old="var sc = keep ? $('.mn-main').scrollTop : 0;"; s=once(s,old,old+" var dsc = keep ? dyn.scrollTop : 0;",d,'sc1')
    old2="$('.mn-main').scrollTop = sc;"; s=once(s,old2,old2+" dyn.scrollTop = dsc;",d,'sc2')
    # lobby camera: gentle drift (reduced-motion safe)
    s=once(s,"angle=.38,d=4.2;","angle=.38+(SL_SWAY?Math.sin(orbit*5)*.09:0),d=4.2;",d,'sway')
    # loadout finishes: legendary class, NEW/Legendary tags, share button
    a="'<button type=\"button\" class=\"loadout-finish'+(i===selectedFinish(key)?' is-selected':'')+'\" data-loadout-finish=\"'+i+'\" aria-pressed=\""
    b="'<button type=\"button\" class=\"loadout-finish'+(f.legendary?' is-legendary':'')+(i===selectedFinish(key)?' is-selected':'')+'\" data-loadout-finish=\"'+i+'\" data-slfid=\"'+esc(key+'|'+f.name)+'\" aria-pressed=\""
    s=once(s,a,b,d,'fin1')
    a="+esc(f.desc||'Cosmetic finish')+'</small></span></button>'"
    b="+esc(f.desc||'Cosmetic finish')+'</small></span>'+slFinishTags(key,f,list)+'</button>'"
    s=once(s,a,b,d,'fin2')
    a="<p class=\"small loadout-integrity-note\">"
    s=once(s,a,"<div class=\"loadout-share\"><button type=\"button\" class=\"btn ghost\" data-sl-share>Share loadout</button></div>"+a,d,'share')
    # features inside the game closure
    anchor="idleCamera(0);\nrequestAnimationFrame(frame);\n})();"
    s=once(s,anchor,"var slFinishTags=function(){return '';};\ntry{\n"+feat_js+"\n}catch(slFeatErr){if(window.console)console.warn('lobby features',slFeatErr);}\n"+anchor,d,'anchor')
    # style layer + intro + match-found overlay
    tail='</style></body></html>'; assert s.rstrip().endswith(tail),(d,'tail'); i=s.rstrip().rfind(tail)
    s=s[:i]+'</style>\n<style id="sightline-lobby-10-premium">\n'+css+'</style>\n'+intro_html+mf_html+'<script>\n'+intro_js+'</script></body></html>'+s[i+len(tail):]
    open(DST+d+'/index.html','w',encoding='utf-8').write(s); print(d,'ok',len(s))
