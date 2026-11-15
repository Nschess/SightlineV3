import bpy,sys
from collections import deque
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index('--')+1],load_ui=False);m=bpy.data.objects['Human']; groups={g.name:g.index for g in m.vertex_groups}; adjacency=[set() for _ in m.data.vertices]
for e in m.data.edges:a,b=e.vertices;adjacency[a].add(b);adjacency[b].add(a)
for side in ('R','L'):
 names=[n for n in groups if n.endswith('.'+side) and n.startswith(('upperarm','lowerarm','wrist','finger','metacarpal'))]; indexes={groups[n] for n in names};sel={v.index for v in m.data.vertices if sum(g.weight for g in v.groups if g.group in indexes)>.08}
 for _ in range(3):sel.update(q for v in tuple(sel) for q in adjacency[v])
 rem=set(sel);components=[]
 while rem:
  seed=rem.pop();comp={seed};stack=[seed]
  while stack:
   for q in adjacency[stack.pop()] & rem:rem.remove(q);comp.add(q);stack.append(q)
  components.append(comp)
 print('ARM_SELECTION',side,'groupVertices',len(sel),'components',sorted([len(c) for c in components],reverse=True)[:8], 'groupNames',names)
 for comp in sorted(components,key=len,reverse=True)[:2]:
  coords=[m.data.vertices[i].co for i in comp];print('  bounds',[[round(min(v[j] for v in coords),3) for j in range(3)],[round(max(v[j] for v in coords),3) for j in range(3)]])
