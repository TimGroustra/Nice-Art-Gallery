@@ -309,7 +309,7 @@
     scene.fog = new THREE.FogExp2(0xf0f0f0, 0.015); // light fog
 
     // Brighter ambient light
-    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
+    const ambient = new THREE.AmbientLight(0xffffff, 0.6); // Increased ambient light to lift shadows
     scene.add(ambient);
 
     // Renderer
@@ -334,8 +334,8 @@
     const renderPass = new RenderPass(scene, camera);
     composer.addPass(renderPass);
     const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.4, 0.6);
-    bloomPass.threshold = 0.3;
-    bloomPass.strength = 0.8;
+    bloomPass.threshold = 0.4; // Slightly higher threshold
+    bloomPass.strength = 0.5; // Reduced bloom strength to mitigate 'blinding white'
     bloomPass.radius = 0.5;
     composer.addPass(bloomPass);
     fxaaPass = new ShaderPass(FXAAShader);
@@ -352,7 +352,7 @@
       // All wall‑type materials share the same stone appearance
       const mat = new THREE.MeshStandardMaterial({
         map: stoneTexture,
-        color: 0xe0e0e0,
+        color: 0x999999, // Changed base color to medium grey stone
         roughness: 0.5,
         metalness: 0.1,
       });