@@ -309,7 +309,7 @@
     scene.fog = new THREE.FogExp2(0xf0f0f0, 0.015); // light fog

     // Brighter ambient light
-    const ambient = new THREE.AmbientLight(0xffffff, 0.4); // Reduced ambient light to prevent overexposure
+    const ambient = new THREE.AmbientLight(0xffffff, 0.8); // Increased ambient light for better visibility
     scene.add(ambient);

     // Renderer
@@ -334,9 +334,9 @@
     const renderPass = new RenderPass(scene, camera);
     composer.addPass(renderPass);
     const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.4, 0.6);
-    bloomPass.threshold = 0.6; // Much higher threshold to only bloom very bright areas
-    bloomPass.strength = 0.3; // Significantly reduced bloom strength
-    bloomPass.radius = 0.2; // Smaller bloom radius
+    bloomPass.threshold = 0.8; // Very high threshold to prevent bloom on walls
+    bloomPass.strength = 0.1; // Minimal bloom strength
+    bloomPass.radius = 0.1; // Very small bloom radius
     composer.addPass(bloomPass);
     fxaaPass = new ShaderPass(FXAAShader);
     const pr = Math.min(window.devicePixelRatio, 2);
@@ -352,10 +352,8 @@
       if (materialCache.has(id)) return materialCache.get(id)!;
       // All wall‑type materials share the same stone appearance
       const mat = new THREE.MeshStandardMaterial({
-        map: stoneTexture,
-        color: 0x888888, // Darker grey for more natural stone look
-        roughness: 0.8, // More rough to reduce specular highlights
-        metalness: 0.05, // Less metallic to reduce reflections
+        color: 0xaaaaaa, // Medium grey for better visibility
+        roughness: 0.9, // Very rough to eliminate specular highlights
       });
       materialCache.set(id, mat);
       return mat;
@@ -400,10 +398,8 @@
     // Emissive frame rim (soft white)
     const rimMat = new THREE.MeshStandardMaterial({
       color: 0xe0e0e0,
-      emissive: 0x000000, // Remove emissive glow from frames
-      emissiveIntensity: 0.8,
-      roughness: 0.3,
-      metalness: 0.2,
+      roughness: 0.7,
+      metalness: 0.1,
     });
     const rim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.12, height + 0.12, 0.06), rimMat);
     rim.position.set(0, 0, -0.02);
@@ -417,11 +413,9 @@
     group.add(imageMesh);

     // Neon border lines (subtle)
-    const neonMat = new THREE.MeshStandardMaterial({
-      emissive: emissiveColor,
-      emissiveIntensity: 0.2, // Reduced neon intensity
-      roughness: 0.2,
-    });
+    const neonMat = new THREE.MeshBasicMaterial({
+      color: emissiveColor,
+    });
     const horizGeom = new THREE.BoxGeometry(width + 0.05, 0.03, 0.015);
     const vertGeom = new THREE.BoxGeometry(0.03, height + 0.05, 0.015);
     const top = new THREE.Mesh(horizGeom, neonMat);
@@ -433,6 +427,12 @@
     group.add(top, bottom, left, right);

     return { group, imageMesh };
+  }
+
+  // Add directional light for better overall illumination
+  function addDirectionalLight(scene: THREE.Scene) {
+    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
+    directionalLight.position.set(5, 10, 7.5);
+    scene.add(directionalLight);
   }

   // ---------------------------------------------------------------------
@@ -635,6 +635,9 @@
     const ambient = new THREE.AmbientLight(0xffffff, 0.8); // Increased ambient light for better visibility
     scene.add(ambient);

+    // Add directional light for better overall illumination
+    addDirectionalLight(scene);
+
     // Renderer
     renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
     renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
@@ -666,9 +669,9 @@
     const renderPass = new RenderPass(scene, camera);
     composer.addPass(renderPass);
     const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.4, 0.6);
-    bloomPass.threshold = 0.8; // Very high threshold to prevent bloom on walls
-    bloomPass.strength = 0.1; // Minimal bloom strength
-    bloomPass.radius = 0.1; // Very small bloom radius
+    bloomPass.threshold = 0.9; // Very high threshold to prevent bloom on walls
+    bloomPass.strength = 0.05; // Minimal bloom strength
+    bloomPass.radius = 0.05; // Very small bloom radius
     composer.addPass(bloomPass);
     fxaaPass = new ShaderPass(FXAAShader);
     const pr = Math.min(window.devicePixelRatio, 2);
@@ -684,10 +687,8 @@
       if (materialCache.has(id)) return materialCache.get(id)!;
       // All wall‑type materials share the same stone appearance
       const mat = new THREE.MeshStandardMaterial({
-        map: stoneTexture,
-        color: 0x888888, // Darker grey for more natural stone look
-        roughness: 0.8, // More rough to reduce specular highlights
-        metalness: 0.05, // Less metallic to reduce reflections
+        color: 0xaaaaaa, // Medium grey for better visibility
+        roughness: 0.9, // Very rough to eliminate specular highlights
       });
       materialCache.set(id, mat);
       return mat;