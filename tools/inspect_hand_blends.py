import bpy, json, sys, re
pat=re.compile(r'(arm|hand|wrist|finger|thumb|elbow|shoulder|clavicle)',re.I)
def audit():
    meshes=[]
    for o in bpy.data.objects:
        if o.type=="MESH":
            groups=[g.name for g in o.vertex_groups if pat.search(g.name)]
            meshes.append({"name":o.name,"verts":len(o.data.vertices),"polys":len(o.data.polygons),"groups":groups,"armature":[m.object.name for m in o.modifiers if m.type=="ARMATURE" and m.object],"parent":o.parent.name if o.parent else None,"materials":[m.name for m in o.data.materials]})
    bones=[]
    for o in bpy.data.objects:
        if o.type=="ARMATURE":
            bones.extend({"rig":o.name,"name":b.name,"parent":b.parent.name if b.parent else None,"deform":b.use_deform} for b in o.data.bones if pat.search(b.name))
    actions=[{"name":a.name,"range":[float(a.frame_range[0]),float(a.frame_range[1])],"curves":len(a.fcurves)} for a in bpy.data.actions]
    print("SIGHTLINE_HAND_SUMMARY "+json.dumps({"file":bpy.data.filepath,"meshCount":len(meshes),"meshes":meshes,"armatureCount":len([o for o in bpy.data.objects if o.type=="ARMATURE"]),"relevantBones":bones,"actions":actions},separators=(",",":")))
for path in sys.argv[sys.argv.index("--")+1:]:
    bpy.ops.wm.open_mainfile(filepath=path,load_ui=False); audit()
