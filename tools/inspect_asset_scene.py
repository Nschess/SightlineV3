import bpy,sys
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index('--')+1],load_ui=False)
for o in bpy.context.scene.objects: print('OBJ',o.name,o.type,o.hide_render,o.hide_viewport)
print('SHADING',[(p.identifier) for p in bpy.types.View3DShading.bl_rna.properties])
