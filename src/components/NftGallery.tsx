// src/components/NftGallery.tsx

// ... (around line 300, inside useEffect)

    // Lights
    const lights: THREE.PointLight[] = [];
    const lightColors = [0xff0066, 0x00ffd5, 0xffff00];
    for (let i = 0; i < 3; i++) {
      const pl = new THREE.PointLight(lightColors[i], 1.2, 15, 2);
      pl.position.set(Math.cos(i / 3 * Math.PI * 2) * 3, 2.5, Math.sin(i / 3 * Math.PI * 2) * 3);
      scene.add(pl);
      lights.push(pl);
    }
    const amb = new THREE.AmbientLight(0x404050, 0.6);
    scene.add(amb);

    // Setup initial panels
// ... (rest of the file)