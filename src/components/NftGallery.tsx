@@ -309,7 +309,7 @@
     scene.fog = new THREE.FogExp2(0xf0f0f0, 0.015); // light fog

     // Brighter ambient light
-    const ambient = new THREE.AmbientLight(0xffffff, 0.6); // Increased ambient light to lift shadows
+    const ambient = new THREE.AmbientLight(0xffffff, 0.4); // Reduced ambient light to prevent overexposure
     scene.add(ambient);

     // Renderer
@@ -334,9 +334,9 @@
     const renderPass = new RenderPass(scene, camera);
     composer.addPass(renderPass);
     const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.4, 0.6);
-    bloomPass.threshold = 0.4; // Slightly higher threshold
-    bloomPass.strength = 0.5; // Reduced bloom strength to mitigate 'blinding white'
-    bloomPass.radius = 0.5;
+    bloomPass.threshold = 0.6; // Much higher threshold to only bloom very bright areas
+    bloomPass.strength = 0.3; // Significantly reduced bloom strength
+    bloomPass.radius = 0.2; // Smaller bloom radius
     composer.addPass(bloomPass);
     fxaaPass = new ShaderPass(FXAAShader);
     const pr = Math.min(window.devicePixelRatio, 2);
@@ -352,9 +352,9 @@
       // All wall‑type materials share the same stone appearance
       const mat = new THREE.MeshStandardMaterial({
         map: stoneTexture,
-        color: 0x999999, // Changed base color to medium grey stone
-        roughness: 0.5,
-        metalness: 0.1,
+        color: 0x888888, // Darker grey for more natural stone look
+        roughness: 0.8, // More rough to reduce specular highlights
+        metalness: 0.05, // Less metallic to reduce reflections
       });
       materialCache.set(id, mat);
       return mat;
@@ -400,7 +400,7 @@
     // Emissive frame rim (soft white)
     const rimMat = new THREE.MeshStandardMaterial({
       color: 0xe0e0e0,
-      emissive: emissiveColor,
+      emissive: 0x000000, // Remove emissive glow from frames
       emissiveIntensity: 0.8,
       roughness: 0.3,
       metalness: 0.2,
@@ -420,7 +420,7 @@
     // Neon border lines (subtle)
     const neonMat = new THREE.MeshStandardMaterial({
       emissive: emissiveColor,
-      emissiveIntensity: 0.6,
+      emissiveIntensity: 0.2, // Reduced neon intensity
       roughness: 0.2,
     });
     const horizGeom = new THREE.BoxGeometry(width + 0.05, 0.03, 0.015);