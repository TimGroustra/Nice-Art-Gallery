# Avatar Assets

This directory is intended to hold the 3D models (.glb files) required by the Avatar Editor.

The following files are expected to be present:

1.  `base_rig.glb`: The main rigged avatar model, containing the skeleton and base body mesh, along with the walk animation.
2.  `heads/head_01.glb`, `heads/head_02.glb`, etc.: Separate head meshes designed to be attached to the "Head" bone of the base rig.
3.  `accessories/hat.glb`, `accessories/backpack.glb`, etc.: Accessory meshes designed to be attached to specific bones (e.g., "Head" or "Spine2").

Please place your generated GLB files here according to the structure defined in `src/pages/AvatarEditor.tsx` and `src/components/AvatarViewer.tsx`.