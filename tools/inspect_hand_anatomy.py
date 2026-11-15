import bpy, sys, json
f=sys.argv[sys.argv.index("--")+1]
bpy.ops.wm.open_mainfile(filepath=f,load_ui=False)
rig=bpy.data.objects["Human.rig"]
mesh=bpy.data.objects["Human"]
out={"armature":rig.name,"matrix_world":[list(row) for row in rig.matrix_world],"meshBounds":[[min((rig.matrix_world@mesh.matrix_world@v.co)[i] for v in mesh.data.vertices) for i in range(3)],[max((rig.matrix_world@mesh.matrix_world@v.co)[i] for v in mesh.data.vertices) for i in range(3)]],"uvLayers":[x.name for x in mesh.data.uv_layers],"arms":{}}
for side in ("R","L"):
 out["arms"][side]={}
 for n in (f"clavicle.{side}",f"shoulder01.{side}",f"upperarm01.{side}",f"upperarm02.{side}",f"lowerarm01.{side}",f"lowerarm02.{side}",f"wrist.{side}",*[f"finger{d}-{j}.{side}" for d in range(1,6) for j in range(1,4)]):
  b=rig.data.bones.get(n)
  if b: out["arms"][side][n]={"head":[round(x,4) for x in b.head_local],"tail":[round(x,4) for x in b.tail_local],"parent":b.parent.name if b.parent else None}
print("SIGHTLINE_ANATOMY "+json.dumps(out,separators=(",",":")))
