@@
-        stepMesh.position.set(...wall.position);
+        stepMesh.position.set(...(wall.position as [number, number, number]));
@@
-      wallMesh.position.set(...wall.position);
+      wallMesh.position.set(...(wall.position as [number, number, number]));
@@
-        panelGroup.position.set(...wall.position);
+        panelGroup.position.set(...(wall.position as [number, number, number]));
@@
-          spot.position.set(...l.position);
+          spot.position.set(...(l.position as [number, number, number]));
@@
-          spot.target.position.set(...(l.target ?? [0, 0, 0]));
+          spot.target.position.set(...((l.target ?? [0, 0, 0]) as [number, number, number]));
@@
-          rect.position.set(...l.position);
+          rect.position.set(...(l.position as [number, number, number]));
@@
-          rect.lookAt(new THREE.Vector3(...(l.target ?? [0, 0, 0])));
+          rect.lookAt(new THREE.Vector3(...((l.target ?? [0, 0, 0]) as [number, number, number])));
@@
-          neon.position.set(...l.position);
+          neon.position.set(...(l.position as [number, number, number]));
@@
-          p.position.set(...l.position);
+          p.position.set(...(l.position as [number, number, number]));