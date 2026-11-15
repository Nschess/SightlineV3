"""Build rigged, weapon-class first-person arms from the isolated MPFB CC0 rig.

Unlike build_firstperson_grips.py, this keeps each arm skinned to its own
retargeted armature and preserves the original weighted finger joints. The old
builder remains untouched and explicitly marked failed for rollback evidence.
"""
import bpy, bmesh, json, math, os, re, struct, sys
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SOURCE = os.path.join(ROOT, 'tools', 'assets', 'firstperson-hands', 'source', 'mpfb-source-human.blend')
RUNTIME_OUT = os.path.join(ROOT, 'AndroidProject', 'app', 'src', 'main', 'assets', 'phone-host', 'models', 'fp-arms')
BLEND_OUT = os.path.join(ROOT, 'tools', 'assets', 'firstperson-hands', 'rigged')
os.makedirs(RUNTIME_OUT, exist_ok=True); os.makedirs(BLEND_OUT, exist_ok=True)

# Wrist is the actual weapon-local hand contact. Axes point from elbow to wrist.
# The forearm length is taken from the CC0 rig and kept within 0.98..1.06 scale.
# These are first-person viewmodel poses; the verified 34 x 28 world-grip map is
# a separate, untouched system.
CLASS_POSES = {
    'pistol':   {'dominant': ((.025,-.090,.050),(-.56,.57,.60),(0,0,-1),(1,0,0)), 'support': ((-.045,-.095,.030),(.58,.56,-.59),(0,0,-1),(-1,0,0)), 'curl': .92},
    'rifle':    {'dominant': ((.025,-.090,.050),(-.56,.57,.60),(0,0,-1),(1,0,0)), 'support': ((-.070,-.060,-.305),(.58,.56,-.59),(0,0,-1),(-1,0,0)), 'curl': .92},
    'smg':      {'dominant': ((.025,-.090,.050),(-.56,.57,.60),(0,0,-1),(1,0,0)), 'support': ((-.050,-.055,-.205),(.58,.56,-.59),(0,0,-1),(-1,0,0)), 'curl': .90},
    'shotgun':  {'dominant': ((.025,-.090,.050),(-.56,.57,.60),(0,0,-1),(1,0,0)), 'support': ((-.055,-.052,-.330),(.58,.56,-.59),(0,0,-1),(-1,0,0)), 'curl': .92},
    'marksman': {'dominant': ((.025,-.090,.055),(-.56,.57,.60),(0,0,-1),(1,0,0)), 'support': ((-.050,-.052,-.365),(.58,.56,-.59),(0,0,-1),(-1,0,0)), 'curl': .92},
    'lmg':      {'dominant': ((.025,-.090,.050),(-.56,.57,.60),(0,0,-1),(1,0,0)), 'support': ((-.060,-.058,-.305),(.58,.56,-.59),(0,0,-1),(-1,0,0)), 'curl': .94},
    'melee':    {'dominant': ((.025,-.090,.090),(-.56,.57,.60),(0,0,-1),(1,0,0)), 'curl': .80},
}

def game_to_blender(v):
    x,y,z = v
    return Vector((x, -z, y))

def frame(axis, finger, width):
    x = axis.normalized()
    y = (finger - x*finger.dot(x)).normalized()
    z = x.cross(y).normalized()
    if z.dot(width) < 0: y=-y; z=-z
    return Matrix((x,y,z)).transposed()

def make_transform(rig, side, target):
    eb = rig.data.bones
    elbow = Vector(eb[f'lowerarm01.{side}'].head_local)
    wrist = Vector(eb[f'wrist.{side}'].head_local)
    index = Vector(eb[f'finger2-1.{side}'].head_local)
    pinky = Vector(eb[f'finger5-1.{side}'].head_local)
    src_axis=(wrist-elbow).normalized()
    src_finger=(index-wrist).normalized()
    src_width=(pinky-index).normalized()
    src_frame=frame(src_axis,src_finger,src_width)
    wrist_game,axis_game,finger_game,width_game=target
    axis=game_to_blender(axis_game).normalized()
    finger=game_to_blender(finger_game).normalized()
    width=game_to_blender(width_game).normalized()
    dst_frame=frame(axis,finger,width)
    rot=dst_frame @ src_frame.transposed()
    src_len=(wrist-elbow).length
    scale=max(.98,min(1.06,src_len/src_len))
    target_wrist=game_to_blender(wrist_game)
    mat=Matrix.Translation(target_wrist) @ rot.to_4x4() @ Matrix.Scale(scale,4) @ Matrix.Translation(-wrist)
    return mat,rot,target_wrist

def arm_bone_names(side):
    pat=re.compile(r'^(clavicle|shoulder01|upperarm\d+|lowerarm\d+|wrist|finger\d+-\d+|metacarpal\d+)\.'+side+r'$')
    return pat

def make_material(name, color, roughness):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=roughness
    return m

def remove_shape_keys(obj):
    if not obj.data.shape_keys: return
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    try: bpy.ops.object.shape_key_remove(all=True)
    finally: obj.select_set(False)

def extract_arm(human, source_rig, side, role, target, curl, root):
    mesh_obj=human.copy();mesh_obj.data=human.data.copy();mesh_obj.name='SightlineFP_'+role+'_SkinnedMesh';bpy.context.collection.objects.link(mesh_obj)
    mesh_obj.matrix_world=human.matrix_world.copy();remove_shape_keys(mesh_obj)
    source_groups={g.name:g.index for g in mesh_obj.vertex_groups}
    side_names=[n for n in source_groups if arm_bone_names(side).match(n)]
    if not side_names: raise RuntimeError('No arm weights for '+side)
    side_indexes={source_groups[n] for n in side_names}
    adjacency=[set() for _ in mesh_obj.data.vertices]
    for e in mesh_obj.data.edges:
        a,b=e.vertices;adjacency[a].add(b);adjacency[b].add(a)
    selected={v.index for v in mesh_obj.data.vertices if sum(g.weight for g in v.groups if g.group in side_indexes)>.08}
    # Extend only across the anatomical shoulder seam. Do not flood into torso.
    for _ in range(2): selected.update(q for v in tuple(selected) for q in adjacency[v])
    remaining=set(selected);components=[]
    while remaining:
        seed=remaining.pop();comp={seed};stack=[seed]
        while stack:
            for q in adjacency[stack.pop()] & remaining: remaining.remove(q);comp.add(q);stack.append(q)
        components.append(comp)
    keep=max(components,key=len)
    if len(keep)<1800: raise RuntimeError(f'Arm extraction unexpectedly small: {side} {len(keep)}')

    # Assign real material zones from the existing anatomical skin weights.
    sleeve=make_material('SightlineFP_Sleeve',(0.22,.28,.23),.9)
    glove=make_material('SightlineFP_Glove',(.035,.045,.042),.82)
    cuff=make_material('SightlineFP_Cuff',(.085,.105,.09),.88)
    mesh_obj.data.materials.clear()
    for m in (sleeve,glove,cuff): mesh_obj.data.materials.append(m)
    wrist_idx=source_groups.get('wrist.'+side)
    finger_idx={source_groups[n] for n in side_names if n.startswith(('finger','metacarpal'))}
    for poly in mesh_obj.data.polygons:
        glove_weight=sum(sum(a.weight for a in mesh_obj.data.vertices[i].groups if a.group in finger_idx) for i in poly.vertices)/len(poly.vertices)
        wrist_weight=sum(sum(a.weight for a in mesh_obj.data.vertices[i].groups if a.group==wrist_idx) for i in poly.vertices)/len(poly.vertices) if wrist_idx is not None else 0
        poly.material_index=2 if wrist_weight>.42 and glove_weight<.78 else (1 if glove_weight>.28 else 0)
        poly.use_smooth=True
    bm=bmesh.new();bm.from_mesh(mesh_obj.data);bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index not in keep],context='VERTS')
    boundaries=[e for e in bm.edges if e.is_boundary]
    if boundaries: bmesh.ops.holes_fill(bm,edges=boundaries,sides=0)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh_obj.data);bm.free();mesh_obj.data.update()

    mat,rot,target_wrist=make_transform(source_rig,side,target)
    for v in mesh_obj.data.vertices: v.co=mat @ v.co
    mesh_obj.data.update()

    rig=source_rig.copy();rig.data=source_rig.data.copy();rig.name='SightlineFP_'+role+'_Armature';bpy.context.collection.objects.link(rig);rig.matrix_world=source_rig.matrix_world.copy()
    bpy.context.view_layer.objects.active=rig;rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT');ebones=rig.data.edit_bones
    keep_names={b.name for b in rig.data.bones if arm_bone_names(side).match(b.name)}
    for eb in list(ebones):
        if eb.name not in keep_names: ebones.remove(eb)
    root_bone=ebones.new('FP_Root');root_bone.head=(0,0,0);root_bone.tail=(0,0,.04);root_bone.use_deform=False
    for name in list(keep_names):
        eb=ebones.get(name)
        if not eb: continue
        old=source_rig.data.bones[name]
        old_roll=old.z_axis.copy()
        eb.head=mat @ eb.head;eb.tail=mat @ eb.tail
        eb.align_roll(rot @ old_roll)
        if eb.parent and eb.parent.name not in keep_names: eb.parent=root_bone;eb.use_connect=False
        if not eb.parent: eb.parent=root_bone;eb.use_connect=False
    bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)

    # Reset source pose then establish a weapon grip by bending actual deform bones.
    for pb in rig.pose.bones:
        pb.rotation_mode='XYZ';pb.rotation_euler=(0,0,0);pb.location=(0,0,0);pb.scale=(1,1,1)
    sign=1 if side=='L' else -1
    for digit in range(1,6):
        for joint in range(1,4):
            pb=rig.pose.bones.get(f'finger{digit}-{joint}.{side}')
            if not pb: raise RuntimeError('Missing articulated digit joint: '+f'finger{digit}-{joint}.{side}')
            if digit==1:
                pb.rotation_euler=(curl*.42,-sign*.10,sign*.30)
            else:
                strength={2:.65,3:1.0,4:.92,5:.78}[digit]
                distal={1:1.0,2:.78,3:.58}[joint]
                pb.rotation_euler=(curl*strength*distal,0,sign*(digit-3)*.045 if joint==1 else 0)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='POSE');bpy.ops.pose.armature_apply(selected=False);bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)

    for group in list(mesh_obj.vertex_groups):
        if group.name not in keep_names: mesh_obj.vertex_groups.remove(group)
    for modifier in list(mesh_obj.modifiers): mesh_obj.modifiers.remove(modifier)
    mod=mesh_obj.modifiers.new('SightlineFP_Skin','ARMATURE');mod.object=rig;mod.use_deform_preserve_volume=True
    mesh_obj.parent=rig;mesh_obj.matrix_parent_inverse=Matrix.Identity(4)
    pivot_name='SightlineFP_'+('Dominant' if role=='dominant' else 'Support')+'_Pivot'
    pivot=bpy.data.objects.new(pivot_name,None);bpy.context.collection.objects.link(pivot);pivot.empty_display_type='PLAIN_AXES';pivot.empty_display_size=.06
    rig.parent=pivot;mesh_obj.parent=pivot
    export_objects.extend((pivot,rig,mesh_obj))
    return {'role':role,'vertices':len(mesh_obj.data.vertices),'triangles':sum(max(0,len(p.vertices)-2) for p in mesh_obj.data.polygons),'fingerBones':[f'finger{d}-{j}.{side}' for d in range(1,6) for j in range(1,4)],'vertexGroupCount':len(mesh_obj.vertex_groups)}

def build_class(name, spec):
    bpy.ops.wm.open_mainfile(filepath=SOURCE,load_ui=False)
    human=bpy.data.objects['Human'];source_rig=bpy.data.objects['Human.rig']
    for obj in list(bpy.context.scene.objects):
        if obj not in (human,source_rig): obj.hide_render=True
    root=bpy.data.objects.new('SightlineFP_'+name.title()+'_WeaponRoot',None);bpy.context.collection.objects.link(root);root.empty_display_type='PLAIN_AXES'
    global export_objects;export_objects=[root]
    arms=[]
    for side,role in (('R','dominant'),('L','support')):
        target=spec.get(role)
        if target is None: continue
        arm=extract_arm(human,source_rig,side,role,target,spec['curl'],root);arms.append(arm)
    # Original full body is only a source and must not leak into the deliverable.
    bpy.data.objects.remove(human,do_unlink=True);bpy.data.objects.remove(source_rig,do_unlink=True)
    for obj in bpy.context.scene.objects:
        if obj not in export_objects: obj.hide_render=True;obj.hide_viewport=True
    bpy.ops.object.select_all(action='DESELECT')
    for obj in export_objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    blend=os.path.join(BLEND_OUT,name+'.blend');glb=os.path.join(RUNTIME_OUT,name+'.glb')
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    bpy.ops.export_scene.gltf(filepath=glb,export_format='GLB',use_selection=True,export_apply=False,export_skins=True,export_animations=False)
    raw=open(glb,'rb').read();magic,version,total=struct.unpack_from('<III',raw,0)
    if magic!=0x46546C67 or version!=2: raise RuntimeError('Invalid GLB header '+name)
    chunk_len,chunk_type=struct.unpack_from('<II',raw,12);doc=json.loads(raw[20:20+chunk_len].decode('utf-8').rstrip('\x00 '))
    skins=doc.get('skins',[]);attrs=[a for m in doc.get('meshes',[]) for p in m.get('primitives',[]) for a in p.get('attributes',{})]
    if len(skins)!=(2 if spec.get('support') else 1): raise RuntimeError(f'{name}: expected skinned armatures, got {len(skins)} skins')
    if not {'JOINTS_0','WEIGHTS_0'}.issubset(set(attrs)): raise RuntimeError(name+': joint weight attributes missing')
    joint_names=set(n.get('name') for n in doc.get('nodes',[]))
    required={n for a in arms for n in a['fingerBones']}
    if not required.issubset(joint_names): raise RuntimeError(name+': finger bones missing from GLB')
    return {'class':name,'blend':os.path.relpath(blend,ROOT),'glb':os.path.relpath(glb,ROOT),'bytes':len(raw),'skins':len(skins),'joints':sum(len(s.get('joints',[])) for s in skins),'hasJOINTS_WEIGHTS':True,'arms':arms}

manifest={'source':'MPFB2 CC0 human mesh and rig preserved from source .blend','workflow':'Continuous weighted arm surfaces; separate retargeted armature per side; wrist/forearm axes aligned to local class target; 15 articulated finger joints per hand retained; grip pose applied as rest pose.','classes':[]}
for name,spec in CLASS_POSES.items():
    print('BUILD',name,flush=True);manifest['classes'].append(build_class(name,spec))
out=os.path.join(ROOT,'tools','assets','firstperson-hands','rigged','manifest.json')
with open(out,'w',encoding='utf-8') as f:json.dump(manifest,f,indent=2)
print('SKINNED_FP_GRIPS '+json.dumps({'manifest':os.path.relpath(out,ROOT),'classes':len(manifest['classes']),'skins':sum(x['skins'] for x in manifest['classes']),'bytes':sum(x['bytes'] for x in manifest['classes'])},separators=(',',':')))
