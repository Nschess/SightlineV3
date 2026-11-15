P='html body.sl-lobby-screen[data-sl-route] #ov-start'
PL=P+' #pn-play.lobby-fullscreen-layout'
V=PL+'.image2-lobby'
for src,dst in (('lobby10.template.css','lobby10.css'),('features.template.css','features.css')):
    t=open('/home/claude/work/lobby-10/'+src).read()
    css=t.replace('@V@',V).replace('@PL@',PL).replace('@P@',P)
    open('/home/claude/work/lobby-10/'+dst,'w').write(css); print(dst,len(css),'bytes')
