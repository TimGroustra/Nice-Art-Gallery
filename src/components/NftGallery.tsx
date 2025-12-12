--- a/src/components/NftGallery.tsx
+++ b/src/components/NftGallery.tsx
@@
-    GalleryLayout.walls.forEach(wall => {
-      const wallMat = getMaterial(wall.material, wall.height);
-      const wallGeom = new THREE.PlaneGeometry(wall.length, wall.height);
-      const wallMesh = new THREE.Mesh(wallGeom, wallMat);
-      wallMesh.position.set(...wall.position);
-      wallMesh.rotation.y = wall.rotationY;
-      scene.add(wallMesh);
-      wallMeshesRef.current.set(wall.key, wallMesh);
-
-      // Collision segments for perimeter / octagon walls
-      if (wall.key.startsWith('wall-') || wall.key.startsWith('octagon-')) {
-        const half = wall.length / 2;
-        const cos = Math.cos(wall.rotationY);
-        const sin = Math.sin(wall.rotationY);
-        const cx = wall.position[0];
-        const cz = wall.position[2];
-        const x1 = cx - half * cos;
-        const z1 = cz + half * sin;
-        const x2 = cx + half * cos;
-        const z2 = cz - half * sin;
-        collisionSegmentsRef.current.push([x1, z1, x2, z2]);
-      }
-
-      if (wall.hasPanel) {
-        const { group: panelGroup, imageMesh } = createFramedPanel(2, 2, NEON_COLOR_MAGENTA);
-        panelGroup.position.set(...wall.position);
-        panelGroup.rotation.y = wall.rotationY;
-        scene.add(panelGroup);
-
-        const prevArrow = new THREE.Mesh(arrowGeom, arrowMat.clone());
-        prevArrow.rotation.set(0, wall.rotationY + Math.PI, 0);
-        const nextArrow = new THREE.Mesh(arrowGeom, arrowMat.clone());
-        nextArrow.rotation.copy(wallGroupRotation(wall.rotationY));
-
-        const basePos = panelGroup.position.clone();
-        const rightVec = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, wall.rotationY, 0));
-        const ARROW_OFFSET = 1.5;
-        prevArrow.position.copy(basePos.clone().addScaledVector(rightVec, -ARROW_OFFSET));
-        nextArrow.position.copy(basePos.clone().addScaledVector(rightVec, ARROW_OFFSET));
-
-        const forwardVec = forwardVector(wall.rotationY);
-        prevArrow.position.addScaledVector(forwardVec, PANEL_OFFSET);
-        nextArrow.position.addScaledVector(forwardVec, PANEL_OFFSET);
-        scene.add(prevArrow);
-        scene.add(nextArrow);
-
-        // Title mesh
-        const titleMesh = new THREE.Mesh(titleGeom, textMatFactory());
-        titleMesh.rotation.copy(wallGroupRotation(wall.rotationY));
-        const titlePos = basePos
-          .clone()
-          .addScaledVector(new THREE.Vector3(0, 1, 0), -1 - TITLE_HEIGHT / 2 - 0.1)
-          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
-        titleMesh.position.copy(titlePos);
-        titleMesh.visible = false;
-        scene.add(titleMesh);
-
-        // Description mesh
-        const descMesh = new THREE.Mesh(descGeom, textMatFactory());
-        descMesh.rotation.copy(wallGroupRotation(wall.rotationY));
-        const descPos = basePos
-          .clone()
-          .addScaledVector(rightVector(wall.rotationY), -TEXT_PANEL_OFFSET_X)
-          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
-        descMesh.position.copy(descPos);
-        descMesh.visible = false;
-        scene.add(descMesh);
-
-        // Attributes mesh
-        const attrMesh = new THREE.Mesh(attrGeom, textMatFactory());
-        attrMesh.rotation.copy(wallGroupRotation(wall.rotationY));
-        const attrPos = basePos
-          .clone()
-          .addScaledVector(rightVector(wall.rotationY), TEXT_PANEL_OFFSET_X)
-          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
-        attrMesh.position.copy(attrPos);
-        attrMesh.visible = false;
-        scene.add(attrMesh);
-
-        // Wall title (above panel)
-        const wallTitleMesh = new THREE.Mesh(wallTitleGeom, textMatFactory());
-        wallTitleMesh.rotation.copy(wallGroupRotation(wall.rotationY));
-        wallTitleMesh.position.set(wall.position[0], wall.position[1] + wall.height / 2 - 0.5, wall.position[2]);
-        wallTitleMesh.position.addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
-        wallTitleMesh.visible = false;
-        scene.add(wallTitleMesh);
-
-        panelsRef.current.push({
-          mesh: imageMesh,
-          wallName: wall.key,
-          metadataUrl: '',
-          isVideo: false,
-          isGif: false,
-          prevArrow,
-          nextArrow,
-          titleMesh,
-          descriptionMesh: descMesh,
-          attributesMesh: attrMesh,
-          wallTitleMesh,
-          currentDescription: '',
-          descriptionScrollY: 0,
-          descriptionTextHeight: 0,
-          currentAttributes: [],
-          videoElement: null,
-          gifStopFunction: null,
-        });
-      }
-    });
+    GalleryLayout.walls.forEach(wall => {
+      const wallMat = getMaterial(wall.material, wall.height);
+      const wallGeom = new THREE.PlaneGeometry(wall.length, wall.height);
+      const wallMesh = new THREE.Mesh(wallGeom, wallMat);
+      wallMesh.position.set(...wall.position);
+      wallMesh.rotation.y = wall.rotationY;
+      scene.add(wallMesh);
+      wallMeshesRef.current.set(wall.key, wallMesh);
+
+      // Collision segments for perimeter / octagon walls
+      if (wall.key.startsWith('wall-') || wall.key.startsWith('octagon-')) {
+        const half = wall.length / 2;
+        const cos = Math.cos(wall.rotationY);
+        const sin = Math.sin(wall.rotationY);
+        const cx = wall.position[0];
+        const cz = wall.position[2];
+        const x1 = cx - half * cos;
+        const z1 = cz + half * sin;
+        const x2 = cx + half * cos;
+        const z2 = cz - half * sin;
+        collisionSegmentsRef.current.push([x1, z1, x2, z2]);
+      }
+
+      // Create panels only for walls that have a panel **and** are not part of the spiral
+      if (wall.hasPanel && !wall.key.startsWith('spiral-nft-')) {
+        const { group: panelGroup, imageMesh } = createFramedPanel(2, 2, NEON_COLOR_MAGENTA);
+        panelGroup.position.set(...wall.position);
+        panelGroup.rotation.y = wall.rotationY;
+        scene.add(panelGroup);
+
+        const prevArrow = new THREE.Mesh(arrowGeom, arrowMat.clone());
+        prevArrow.rotation.set(0, wall.rotationY + Math.PI, 0);
+        const nextArrow = new THREE.Mesh(arrowGeom, arrowMat.clone());
+        nextArrow.rotation.copy(wallGroupRotation(wall.rotationY));
+
+        const basePos = panelGroup.position.clone();
+        const rightVec = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, wall.rotationY, 0));
+        const ARROW_OFFSET = 1.5;
+        prevArrow.position.copy(basePos.clone().addScaledVector(rightVec, -ARROW_OFFSET));
+        nextArrow.position.copy(basePos.clone().addScaledVector(rightVec, ARROW_OFFSET));
+
+        const forwardVec = forwardVector(wall.rotationY);
+        prevArrow.position.addScaledVector(forwardVec, PANEL_OFFSET);
+        nextArrow.position.addScaledVector(forwardVec, PANEL_OFFSET);
+        scene.add(prevArrow);
+        scene.add(nextArrow);
+
+        // Title mesh
+        const titleMesh = new THREE.Mesh(titleGeom, textMatFactory());
+        titleMesh.rotation.copy(wallGroupRotation(wall.rotationY));
+        const titlePos = basePos
+          .clone()
+          .addScaledVector(new THREE.Vector3(0, 1, 0), -1 - TITLE_HEIGHT / 2 - 0.1)
+          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
+        titleMesh.position.copy(titlePos);
+        titleMesh.visible = false;
+        scene.add(titleMesh);
+
+        // Description mesh
+        const descMesh = new THREE.Mesh(descGeom, textMatFactory());
+        descMesh.rotation.copy(wallGroupRotation(wall.rotationY));
+        const descPos = basePos
+          .clone()
+          .addScaledVector(rightVector(wall.rotationY), -TEXT_PANEL_OFFSET_X)
+          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
+        descMesh.position.copy(descPos);
+        descMesh.visible = false;
+        scene.add(descMesh);
+
+        // Attributes mesh
+        const attrMesh = new THREE.Mesh(attrGeom, textMatFactory());
+        attrMesh.rotation.copy(wallGroupRotation(wall.rotationY));
+        const attrPos = basePos
+          .clone()
+          .addScaledVector(rightVector(wall.rotationY), TEXT_PANEL_OFFSET_X)
+          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
+        attrMesh.position.copy(attrPos);
+        attrMesh.visible = false;
+        scene.add(attrMesh);
+
+        // Wall title (above panel)
+        const wallTitleMesh = new THREE.Mesh(wallTitleGeom, textMatFactory());
+        wallTitleMesh.rotation.copy(wallGroupRotation(wall.rotationY));
+        wallTitleMesh.position.set(wall.position[0], wall.position[1] + wall.height / 2 - 0.5, wall.position[2]);
+        wallTitleMesh.position.addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
+        wallTitleMesh.visible = false;
+        scene.add(wallTitleMesh);
+
+        panelsRef.current.push({
+          mesh: imageMesh,
+          wallName: wall.key,
+          metadataUrl: '',
+          isVideo: false,
+          isGif: false,
+          prevArrow,
+          nextArrow,
+          titleMesh,
+          descriptionMesh: descMesh,
+          attributesMesh: attrMesh,
+          wallTitleMesh,
+          currentDescription: '',
+          descriptionScrollY: 0,
+          descriptionTextHeight: 0,
+          currentAttributes: [],
+          videoElement: null,
+          gifStopFunction: null,
+        });
+      }
+    });
*** End of File
---