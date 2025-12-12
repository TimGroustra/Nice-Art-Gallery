@@ -1013,7 +1013,7 @@
         // Glass railing segment (placed on the outer edge of the step)
         const railingHeight = 1.1;
         const railingOffset = STAIR_OUTER_R - STAIR_CENTER_R; // 0.8m
-        
+
         const railingX = CENTER_X + STAIR_OUTER_R * Math.sin(currentAngle);
         const railingZ = CENTER_Z + STAIR_OUTER_R * Math.cos(currentAngle);
 
@@ -1021,7 +1021,7 @@
             key: `stair-rail-${i}`,
             position: [railingX, currentY + railingHeight / 2 + stepHeight, railingZ],
             length: STAIR_WIDTH,
-            height: railingHeight,
+            height: railingHeight,
             rotationY: currentAngle + Math.PI / 2, // Aligned tangentially
             material: MaterialId.Glass,
             hasPanel: false,
@@ -1029,6 +1029,7 @@
     }
     return steps;
 }
+
 
 // --- Main Layout Definition ---
 
@@ -1108,7 +1109,7 @@
         const stepMesh = new THREE.Mesh(stepGeom, getMaterial(wall.material, wall.height));
         stepMesh.position.set(...wall.position);
         stepMesh.rotation.y = wall.rotationY;
-        scene.add(stepMesh);
+        scene.add(stepMesh);
         stepMeshes.push(stepMesh);
         // No panels or arrows on steps, so return early
         return;
@@ -1121,7 +1122,7 @@
       const wallMat = getMaterial(wall.material, wall.height);
       const wallGeom = new THREE.PlaneGeometry(wall.length, wall.height);
       const wallMesh = new THREE.Mesh(wallGeom, wallMat);
-      wallMesh.position.set(...wall.position);
+      wallMesh.position.set(...wall.position);
       wallMesh.rotation.y = wall.rotationY;
       scene.add(wallMesh);
       wallMeshesRef.current.set(wall.key, wallMesh);
@@ -1143,7 +1144,7 @@
         const { group: panelGroup, imageMesh } = createFramedPanel(2, 2, NEON_COLOR_MAGENTA);
         panelGroup.position.set(...wall.position);
         panelGroup.rotation.y = wall.rotationY;
-        scene.add(panelGroup);
+        scene.add(panelGroup);

         const prevArrow = new THREE.Mesh(arrowGeom, arrowMat.clone());
         prevArrow.rotation.set(0, wall.rotationY + Math.PI, 0);
@@ -1158,7 +1159,7 @@
         const forwardVec = forwardVector(wall.rotationY);
         prevArrow.position.addScaledVector(forwardVec, PANEL_OFFSET);
         nextArrow.position.addScaledVector(forwardVec, PANEL_OFFSET);
-        scene.add(prevArrow);
+        scene.add(prevArrow);
         scene.add(nextArrow);

         // Title mesh
@@ -1168,7 +1169,7 @@
           .clone()
           .addScaledVector(new THREE.Vector3(0, 1, 0), -1 - TITLE_HEIGHT / 2 - 0.1)
           .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
-        titleMesh.position.copy(titlePos);
+        titleMesh.position.copy(titlePos);
         titleMesh.visible = false;
         scene.add(titleMesh);

@@ -1178,7 +1179,7 @@
         const descPos = basePos
           .clone()
           .addScaledVector(rightVector(wall.rotationY), -TEXT_PANEL_OFFSET_X)
-          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
+          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
         descMesh.position.copy(descPos);
         descMesh.visible = false;
         scene.add(descMesh);
@@ -1189,7 +1190,7 @@
         const attrPos = basePos
           .clone()
           .addScaledVector(rightVector(wall.rotationY), TEXT_PANEL_OFFSET_X)
-          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
+          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
         attrMesh.position.copy(attrPos);
         attrMesh.visible = false;
         scene.add(attrMesh);
@@ -1199,7 +1200,7 @@
         wallTitleMesh.rotation.copy(wallGroupRotation(wall.rotationY));
         wallTitleMesh.position.set(wall.position[0], wall.position[1] + wall.height / 2 - 0.5, wall.position[2]);
         wallTitleMesh.position.addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
-        wallTitleMesh.visible = false;
+        wallTitleMesh.visible = false;
         scene.add(wallTitleMesh);

         panelsRef.current.push({
@@ -1223,7 +1224,7 @@
     // Helper rotation / vector functions
     function wallGroupRotation(yaw: number) {
       return new THREE.Euler(0, yaw, 0, 'XYZ');
-    }
+    }
     function forwardVector(yaw: number) {
       const v = new THREE.Vector3(0, 0, 1);
       v.applyEuler(new THREE.Euler(0, yaw, 0));
@@ -1233,6 +1234,7 @@
       const v = new THREE.Vector3(1, 0, 0);
       v.applyEuler(new THREE.Euler(0, yaw, 0));
       return v;
+    }
     }

     // Lighting
@@ -1250,7 +1252,7 @@
           spot.target.position.set(...(l.target ?? [0, 0, 0]));
           scene.add(spot.target);
           light = spot;
-          break;
+          break;
         case 'area':
           const rect = new THREE.RectAreaLight(col, l.intensity / 800, 2, 2);
           rect.position.set(...l.position);
@@ -1261,7 +1263,7 @@
           const neon = new THREE.PointLight(col, l.intensity / 200, 5);
           neon.position.set(...l.position);
           light = neon;
-          break;
+          break;
         default:
           const p = new THREE.PointLight(col, l.intensity / 1000);
           p.position.set(...l.position);
@@ -1275,7 +1277,7 @@
     let moveForward = false,
       moveBackward = false,
       moveLeft = false,
-      moveRight = false;
+      moveRight = false;
     const vel = new THREE.Vector3(),
       dir = new THREE.Vector3(),
       speed = 20.0;
@@ -1285,7 +1287,7 @@
     const onKeyDown = (e: KeyboardEvent) => {
       switch (e.code) {
         case 'KeyW':
-          moveForward = true;
+          moveForward = true;
           break;
         case 'KeyA':
           moveLeft = true;
@@ -1294,7 +1296,7 @@
           moveBackward = true;
           break;
         case 'KeyD':
-          moveRight = true;
+          moveRight = true;
           break;
       }
     };
@@ -1302,7 +1304,7 @@
       switch (e.code) {
         case 'KeyW':
           moveForward = false;
-          break;
+          break;
         case 'KeyA':
           moveLeft = false;
           break;
@@ -1310,7 +1312,7 @@
           moveBackward = false;
           break;
         case 'KeyD':
-          moveRight = false;
+          moveRight = false;
           break;
       }
     };
@@ -1321,7 +1323,7 @@
     const raycaster = new THREE.Raycaster();
     const center = new THREE.Vector2(0, 0);
     let currentTargetedPanel: Panel | null = null;
-    let currentTargetedArrow: THREE.Mesh | null = null;
+    let currentTargetedArrow: THREE.Mesh | null = null;
     let currentTargetedDescriptionPanel: Panel | null = null;

     const onDocumentMouseDown = () => {
@@ -1330,7 +1332,7 @@
         const panel = panelsRef.current.find(p => p.prevArrow === currentTargetedArrow || p.nextArrow === currentTargetedArrow);
         if (panel) {
           const dir = currentTargetedArrow === panel.nextArrow ? 'next' : 'prev';
-          if (updatePanelIndex(panel.wallName, dir)) {
+          if (updatePanelIndex(panel.wallName, dir)) {
             const src = getCurrentNftSource(panel.wallName);
             updatePanelContent(panel, src);
           }
@@ -1347,7 +1349,7 @@
     renderer.domElement.addEventListener('click', onDocumentMouseDown);

     // Description scrolling
-    const onDocumentWheel = (e: WheelEvent) => {
+    const onDocumentWheel = (e: WheelEvent) => {
       if (!controls.isLocked || !currentTargetedDescriptionPanel) return;
       const panel = currentTargetedDescriptionPanel;
       const scrollAmt = e.deltaY * 0.5;
@@ -1357,7 +1359,7 @@
       let newY = panel.descriptionScrollY + scrollAmt;
       newY = Math.max(0, Math.min(newY, maxScroll));
       if (newY !== panel.descriptionScrollY) {
-        panel.descriptionScrollY = newY;
+        panel.descriptionScrollY = newY;
         const txtColor = GALLERY_PANEL_CONFIG[panel.wallName]?.text_color || 'white';
         const { texture } = createTextTexture(panel.currentDescription, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, txtColor, {
           wordWrap: true,
@@ -1373,7 +1375,7 @@
     let prevTime = performance.now();
     const animate = () => {
       requestAnimationFrame(animate);
-      const now = performance.now();
+      const now = performance.now();
       const delta = (now - prevTime) / 1000;

       if (controls.isLocked) {
@@ -1383,7 +1385,7 @@
         dir.z = Number(moveForward) - Number(moveBackward);
         dir.x = Number(moveRight) - Number(moveLeft);
         dir.normalize();

+
         if (moveForward || moveBackward) vel.z -= dir.z * speed * delta;
         if (moveLeft || moveRight) vel.x -= dir.x * speed * delta;

@@ -1391,7 +1393,7 @@
         const prevZ = camera.position.z;

         controls.moveRight(-vel.x * delta);
-        controls.moveForward(-vel.z * delta);
+        controls.moveForward(-vel.z * delta);

         const curX = camera.position.x;
         const curZ = camera.position.z;
@@ -1400,7 +1402,7 @@
         const min = HALF_T + PLAYER_RADIUS;
         const max = L - HALF_T - PLAYER_RADIUS;
         if (curX < min || curX > max || curZ < min || curZ > max) {
-          camera.position.x = prevX;
+          camera.position.x = prevX;
           camera.position.z = prevZ;
           vel.set(0, 0, 0);
         } else {
@@ -1415,7 +1417,7 @@
         }

         // Stair stepping
-        const downOrigin = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z);
+        const downOrigin = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z);
         raycaster.set(downOrigin, new THREE.Vector3(0, -1, 0));
         const stepHits = raycaster.intersectObjects(stepMeshes, true);
-        
+
         let targetY = FLOOR_LEVELS[0] + PLAYER_HEIGHT;
-        
+
         if (stepHits.length > 0) {
           targetY = stepHits[0].point.y + PLAYER_HEIGHT;
         } else {
@@ -1427,7 +1429,7 @@
               }
           }
           targetY = closestFloorY + PLAYER_HEIGHT;
-        }
-        
+        }
+
         camera.position.y += (targetY - camera.position.y) * 0.5;

         // Raycast hover for arrows
@@ -1437,7 +1439,7 @@
         );

         panelsRef.current.forEach(p => {
-          (p.prevArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR);
+          (p.prevArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR);
           (p.nextArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR);
         });
         currentTargetedPanel = null;
@@ -1447,7 +1449,7 @@
         if (hits.length && hits[0].distance < 5) {
           const obj = hits[0].object as THREE.Mesh;
           const panel = panelsRef.current.find(p => p.mesh === obj || p.prevArrow === obj || p.nextArrow === obj || p.descriptionMesh === obj);
-          if (panel) {
+          if (panel) {
             if (obj === panel.mesh) currentTargetedPanel = panel;
             else if (obj === panel.prevArrow || obj === panel.nextArrow) {
               currentTargetedArrow = obj;
@@ -1460,7 +1462,7 @@
         }
       }

-      prevTime = now;
+      prevTime = now;
       composer.render();
     };
     animate();
@@ -1470,7 +1472,7 @@
       const dx = x2 - x1;
       const dz = z2 - z1;
       const lenSq = dx * dx + dz * dz;
-      if (lenSq === 0) return Math.hypot(px - x1, pz - z1);
+      if (lenSq === 0) return Math.hypot(px - x1, pz - z1);
       let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
       t = Math.max(0, Math.min(1, t));
       const cx = x1 + t * dx;
@@ -1481,7 +1483,7 @@
     // Load all panels after config init
     const loadAllPanels = async () => {
       await initializeGalleryConfig();
-      for (const panel of panelsRef.current) {
+      for (const panel of panelsRef.current) {
         const src = getCurrentNftSource(panel.wallName);
         await updatePanelContent(panel, src);
         await new Promise(r => setTimeout(r, 100));
@@ -1491,7 +1493,7 @@
     loadAllPanels();

     // Window resize handling
-    const onWindowResize = () => {
+    const onWindowResize = () => {
       const w = window.innerWidth;
       const h = window.innerHeight;
       camera.aspect = w / h;
@@ -1505,7 +1507,7 @@
     window.addEventListener('resize', onWindowResize);

     // Cleanup
-    return () => {
+    return () => {
       document.removeEventListener('click', onDocumentMouseDown);
       document.removeEventListener('keydown', onKeyDown);
       document.removeEventListener('keyup', onKeyUp);
@@ -1514,7 +1516,7 @@
       mountRef.current?.removeChild(renderer.domElement);
       controls.dispose();

-      panelsRef.current.forEach(p => {
+      panelsRef.current.forEach(p => {
         if (p.videoElement) {
           p.videoElement.pause();
           p.videoElement.removeAttribute('src');
@@ -1523,7 +1525,7 @@
       });

       scene.traverse(obj => {
-        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
+        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
           obj.geometry.dispose();
           if (Array.isArray(obj.material)) {
             obj.material.forEach(m => {
@@ -1531,7 +1533,7 @@
               m.dispose();
             });
           } else {
-            const mat = obj.material as THREE.Material;
+            const mat = obj.material as THREE.Material;
             if ('map' in mat && (mat as any).map) (mat as any).map.dispose();
             mat.dispose();
           }
@@ -1540,7 +1542,7 @@
       renderer.dispose();
       delete (window as any).galleryControls;
     };
-  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback]);
+  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback]);

   // UI – modal and info overlay
   return (
@@ -1559,7 +1561,7 @@
           collection={selectedInfo.collection}
           tokenId={selectedInfo.tokenId}
           onOpenMarketplace={() => {
-            if (selectedInfo.collection && selectedInfo.tokenId !== undefined) {
+            if (selectedInfo.collection && selectedInfo.tokenId !== undefined) {
               setMarketBrowserState({
                 open: true,
                 collection: selectedInfo.collection,
@@ -1572,4 +1574,4 @@
   );
 };

-export default NftGallery;
+export default NftGallery;