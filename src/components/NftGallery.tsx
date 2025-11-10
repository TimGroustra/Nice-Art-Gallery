// src/components/NftGallery.tsx

// ... (around line 300, inside useEffect)

    // Lights
    const lights: THREE.PointLight[] = [];
    const NUM_DISCO_LIGHTS = 3;
    const discoLightHeight = 2.5;
    const lightColors = [0xff0066, 0x00ffd5, 0xffff00];

    for (let i = 0; i < NUM_DISCO_LIGHTS; i++) {
      const color = lightColors[i];
      const initialX = Math.cos(i / NUM_DISCO_LIGHTS * Math.PI * 2) * 3;
      const initialZ = Math.sin(i / NUM_DISCO_LIGHTS * Math.PI * 2) * 3;

      const pl = new THREE.PointLight(color, 1.2, 15, 2);
      pl.position.set(initialX, discoLightHeight, initialZ);
      scene.add(pl);
      lights.push(pl);
    }
    const amb = new THREE.AmbientLight(0x404050, 0.6);
    scene.add(amb);

    // Setup initial panels
// ... (rest of the file)