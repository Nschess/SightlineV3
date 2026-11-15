"""EXPERIMENTAL / VISUAL ACCEPTANCE FAILED.

Build static, posed first-person arm meshes from the CC0 MPFB human rig.

This is a modeling/export utility, not part of the game runtime. It keeps the
base body's continuous arm/hand surfaces and bakes finger articulation before
export; no primitive fingers are generated here. Do not package or reactivate
the output without new in-game review: current grip placement and reload poses
are visibly unacceptable.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

OUT = os.path.join(os.path.dirname(__file__), 'assets', 'firstperson-hands')
BASE_HUMAN = os.path.join(OUT, 'source', 'mpfb-source-human.blend')
os.makedirs(OUT, exist_ok=True)

# Clear default scene and load only the source rig generated from MPFB's CC0 base.
bpy.ops.wm.open_mainfile(filepath=BASE_HUMAN)
human = bpy.data.objects['Human']
rig = bpy.data.objects['Human.rig']

# Original surfaces remain continuous from forearm through palm and fingers.
cloth = bpy.data.materials.new('SightlineFP_Sleeve')
cloth.diffuse_color=(.24,.29,.25,1); cloth.use_nodes=True
cloth.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.24,.29,.25,1)
cloth.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.88
glove = bpy.data.materials.new('SightlineFP_Glove')
glove.diffuse_color=(.055,.065,.060,1); glove.use_nodes=True
glove.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.055,.065,.060,1)
glove.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.76
cuff = bpy.data.materials.new('SightlineFP_Cuff')
cuff.diffuse_color=(.105,.125,.11,1); cuff.use_nodes=True
cuff.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.105,.125,.11,1)
cuff.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.83

for name in ('Cube','Camera','Light'):
    obj=bpy.data.objects.get(name)
    if obj: bpy.data.objects.remove(obj, do_unlink=True)

group_by_name={g.name:g for g in human.vertex_groups}
bone_by_name=rig.data.bones
armature_mod=next(m for m in human.modifiers if m.type=='ARMATURE')
assert armature_mod.object is rig

def group_weight(vertex, names):
    by_idx={group_by_name[name].index for name in names if name in group_by_name}
    return sum(a.weight for a in vertex.groups if a.group in by_idx)

def side_groups(side):
    return [name for name in group_by_name if name.endswith('.'+side) and
            (name.startswith('upperarm') or name.startswith('lowerarm') or name.startswith('wrist') or name.startswith('finger'))]

IK_CONSTRAINTS=[]
IK_TARGETS=[]

def clear_ik():
    for bone, constraint in IK_CONSTRAINTS:
        try: bone.constraints.remove(constraint)
        except (RuntimeError, TypeError): pass
    IK_CONSTRAINTS.clear()
    for obj in IK_TARGETS:
        if obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    IK_TARGETS.clear()

def pose_arm_chain(side):
    """Give the source anatomical arm a real elbow bend before viewmodel fitting."""
    shoulder=Vector(bone_by_name[f'upperarm01.{side}'].head_local)
    wrist=Vector(bone_by_name[f'wrist.{side}'].head_local)
    elbow=Vector(bone_by_name[f'lowerarm01.{side}'].head_local)
    target=bpy.data.objects.new(f'FP_{side}_wrist_IK',None);bpy.context.collection.objects.link(target)
    pole=bpy.data.objects.new(f'FP_{side}_elbow_pole',None);bpy.context.collection.objects.link(pole)
    target.location=wrist
    # The pole projects the elbow slightly forward from the source arm plane.
    # Its pose is then rotated as a connected upper/lower-arm chain to the gun.
    pole.location=(shoulder+wrist)*.5+Vector((0,-.16,0))
    IK_TARGETS.extend((target,pole))
    forearm=rig.pose.bones[f'lowerarm02.{side}']
    ik=forearm.constraints.new('IK');ik.target=target;ik.pole_target=pole;ik.chain_count=4;ik.use_tail=True;ik.iterations=64
    IK_CONSTRAINTS.append((forearm,ik))
    bpy.context.view_layer.update()

def finger_pose(side, curl, spread):
    """Curl all articulated digits around a weapon grip, not a flat A-pose."""
    for digit in range(1,6):
        for joint in range(1,4):
            name=f'finger{digit}-{joint}.{side}'
            pb=rig.pose.bones.get(name)
            if not pb: continue
            pb.rotation_mode='XYZ'
            if digit==1: # thumb closes across the palm
                pb.rotation_euler=(curl*.48, -side_sign(side)*.08, -side_sign(side)*.30)
            else:
                distal=1.0 if joint==1 else (.78 if joint==2 else .56)
                splay=(digit-3)*spread if joint==1 else 0
                pb.rotation_euler=(curl*distal, 0, side_sign(side)*splay)

def side_sign(side):
    return 1 if side=='L' else -1

def game_to_blender(v):
    """Convert Three.js Y-up viewmodel coordinates to Blender Z-up coordinates."""
    x,y,z=v
    return Vector((x,-z,y))

def basis(axis, finger, width):
    # Preserve the measured elbow-to-wrist direction first, then align the
    # finger ray to the weapon contact. The finger-span vector chooses the
    # handedness; the previous width-first frame let forearms rotate across guns.
    x=axis.normalized()
    y=(finger-x*finger.dot(x)).normalized()
    z=x.cross(y).normalized()
    if z.dot(width)<0: y=-y; z=-z
    return Matrix((x,y,z)).transposed()

def create_arm(side, role, target_wrist, target_elbow, target_finger, target_width,
               curl, spread):
    target_wrist=game_to_blender(target_wrist)
    target_elbow=game_to_blender(target_elbow)
    target_finger=game_to_blender(target_finger)
    target_width=game_to_blender(target_width)
    finger_pose(side,curl,spread)
    pose_arm_chain(side)
    bpy.context.view_layer.update()
    mask_mods=[m for m in human.modifiers if m.type=='MASK']
    mask_states=[m.show_viewport for m in mask_mods]
    for m in mask_mods: m.show_viewport=False
    bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get()
    evaluated=human.evaluated_get(deps)
    evaluated_mesh=evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=deps)
    mesh=evaluated_mesh.copy()
    evaluated.to_mesh_clear()
    for m,state in zip(mask_mods,mask_states): m.show_viewport=state
    bpy.context.view_layer.update()
    # Pick only this arm's lower forearm, wrist and five fingers, then expand
    # through nearby connected vertices for a smooth elbow-side sleeve cut.
    names=side_groups(side)
    selected={v.index for v in human.data.vertices if group_weight(v,names)>.08}
    adjacency={v.index:set() for v in mesh.vertices}
    for edge in mesh.edges:
        a,b=edge.vertices; adjacency[a].add(b); adjacency[b].add(a)
    for _ in range(3):
        selected.update(n for v in tuple(selected) for n in adjacency[v])
    # Keep the connected component containing the hand; this drops fingernail
    # islands from the naked basemesh so the glove reads as a clean surface.
    remaining=set(selected); components=[]
    while remaining:
        seed=remaining.pop(); comp={seed}; stack=[seed]
        while stack:
            for nxt in adjacency[stack.pop()] & remaining:
                remaining.remove(nxt); comp.add(nxt); stack.append(nxt)
        components.append(comp)
    keep=max(components,key=len)
    mesh.materials.clear(); mesh.materials.append(cloth); mesh.materials.append(glove); mesh.materials.append(cuff)
    # Material-zone weights come from the actual rig groups, including wrist
    # weights; this fixes the earlier prototype's abrupt, incomplete glove mask.
    glove_names=[n for n in names if n.startswith('wrist') or n.startswith('finger')]
    cuff_names=[n for n in names if n.startswith('wrist')]
    for poly in mesh.polygons:
        glove_w=sum(group_weight(human.data.vertices[i],glove_names) for i in poly.vertices)/len(poly.vertices)
        cuff_w=sum(group_weight(human.data.vertices[i],cuff_names) for i in poly.vertices)/len(poly.vertices)
        poly.material_index=2 if cuff_w>.50 and .16<glove_w<.88 else (1 if glove_w>=.36 else 0)
        poly.use_smooth=True
    bm=bmesh.new(); bm.from_mesh(mesh); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index not in keep],context='VERTS')
    if any(e.is_boundary for e in bm.edges):
        bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.to_mesh(mesh); bm.free(); mesh.update()
    # Source anatomical landmarks (MPFB's default adult proportions).
    elbow=Vector(rig.pose.bones[f'lowerarm01.{side}'].head)
    wrist=Vector(rig.pose.bones[f'wrist.{side}'].head)
    index=Vector(rig.pose.bones[f'finger2-1.{side}'].head)
    pinky=Vector(rig.pose.bones[f'finger5-1.{side}'].head)
    source_axis=(wrist-elbow).normalized()
    source_finger=(index-wrist).normalized()
    source_width=(pinky-index).normalized()
    source_basis=basis(source_axis,source_finger,source_width)
    # Mild cross-axis compression keeps forearms plausible in the compact FP
    # viewmodel while preserving their natural length and connected surfaces.
    source_len=(wrist-elbow).length
    target_axis=(Vector(target_wrist)-Vector(target_elbow)).normalized()
    target_basis=basis(target_axis,Vector(target_finger),Vector(target_width))
    scale_axis=(Vector(target_wrist)-Vector(target_elbow)).length/source_len
    # Express vertices in the source anatomical frame, then rebuild them in the
    # target weapon frame. The former rot.T -> scale -> rot chain cancelled the
    # rotation for uniform scale and left the source arms crossing the guns.
    center=Vector(wrist)
    for v in mesh.vertices:
        local=source_basis.transposed() @ (v.co-center)
        local=Vector((local.x*scale_axis,local.y*.78,local.z*.82))
        v.co=target_basis @ local + Vector(target_wrist)
    mesh.update()
    mins=tuple(round(min(v.co[i] for v in mesh.vertices),3) for i in range(3))
    maxs=tuple(round(max(v.co[i] for v in mesh.vertices),3) for i in range(3))
    print('ARM_DEBUG',side,role,'bounds',mins,maxs,'target_wrist',tuple(round(v,3) for v in target_wrist),'scale',round(scale_axis,3),'selected',len(keep))
    obj=bpy.data.objects.new(f'SightlineFP_{role}_Arm',mesh); bpy.context.collection.objects.link(obj)
    # The MPFB source carries face-shape keys. The armature pose has already
    # been evaluated into this static viewmodel, so remove those full-body keys
    # rather than exporting irrelevant morph targets.
    if obj.data.shape_keys:
        obj.shape_key_clear()
    obj.parent=None
    obj['source']='MPFB2 CC0 base human; continuous weighted arm/hand surface; finger-pose baked'
    obj['pose_role']=role
    return obj

def make_pair(flavor, targets, curl, spread):
    # Clear previous generated parts.
    clear_ik()
    for pb in rig.pose.bones:
        pb.location=(0,0,0);pb.rotation_mode='QUATERNION';pb.rotation_quaternion=(1,0,0,0);pb.scale=(1,1,1)
    for obj in list(bpy.data.objects):
        if obj.name.startswith('SightlineFP_'):
            bpy.data.objects.remove(obj,do_unlink=True)
    # Each side uses an independent transform into measured weapon-local grip
    # anchors; no arm is hidden by moving the camera or changing weapon scale.
    # In game-view coordinates the player's right hand is on +X. The MPFB
    # source character faces -Y, so its anatomical right arm is the .R chain;
    # using .L here had put the thumb/palm on the wrong side of the weapon.
    dominant=create_arm('R',flavor+'_dominant',*targets['dominant'],curl,spread)
    support=create_arm('L',flavor+'_support',*targets['support'],curl*.82,spread)
    clear_ik()
    # The output blend retains the generated editable meshes; rig source is
    # retained separately by the modeling toolchain, never changed in place.
    bpy.ops.object.select_all(action='DESELECT')
    dominant.select_set(True); support.select_set(True); bpy.context.view_layer.objects.active=dominant
    blend=os.path.join(OUT,flavor+'-hands.blend')
    glb=os.path.join(OUT,flavor+'-hands.glb')
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    bpy.ops.export_scene.gltf(filepath=glb,export_format='GLB',use_selection=True,export_apply=True,export_animations=False)
    print('BUILT',flavor,'dominant',len(dominant.data.vertices),len(dominant.data.polygons),'support',len(support.data.vertices),len(support.data.polygons),'glb_bytes',os.path.getsize(glb))

# Weapon-local coordinates match buildGun's group origin, not the camera.
# Right hand wraps the pistol grip; the support hand lands at the front of the
# rifle's forend. The support wrist group remains independently retractable
# during the existing magazine reload window.
PISTOL={
 # The elbow is deliberately below and behind the viewmodel origin. The old
 # positive-Z elbow sat only centimetres in front of the camera after the gun
 # group transform, causing extreme perspective scale and a crossed arm.
 'dominant':((.025,-.090,.050),(.225,-.300,-.145),(-1,0,0),(0,-1,0)),
 'support': ((-.045,-.100,.055),(-.260,-.285,-.145),(1,0,0),(-1,0,0)),
}
RIFLE={
 'dominant':((.040,-.100,.110),(.245,-.300,-.145),(-1,0,0),(0,-1,0)),
 # Support wrist stays on the handguard. Move only its elbow off-camera so
 # the forearm approaches the weapon from below instead of stretching across it.
 'support': ((-.085,-.055,-.310),(-.340,-.285,-.170),(1,0,0),(-1,0,0)),
}
make_pair('pistol',PISTOL,1.00,.035)
make_pair('rifle',RIFLE,.92,.045)
