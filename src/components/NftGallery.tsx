// ... inside the loop for stair steps
  const stepMesh = new THREE.Mesh(stepGeom, getMaterial(wall.material, wall.height));
  stepMesh.position.set(...(wall.position as [number, number, number])); // cast to tuple
  stepMesh.rotation.y = wall.rotationY;

  // ... inside the loop for walls
  const wallMesh = new THREE.Mesh(wallGeom, wallMat);
  wallMesh.position.set(...(wall.position as [number, number, number])); // cast to tuple
  wallMesh.rotation.y = wall.rotationY;

  // ... inside the loop for panels
  const { group: panelGroup, imageMesh } = createFramedPanel(2, 2, NEON_COLOR_MAGENTA);
  panelGroup.position.set(...(wall.position as [number, number, number])); // cast to tuple
  panelGroup.rotation.y = wall.rotationY;

  // ... inside the lighting loop
  const spot = new THREE.SpotLight(col, l.intensity / 1000);
  spot.position.set(...(l.position as [number, number, number])); // cast to tuple
  spot.angle = ((l.angle ?? 30) * Math.PI) / 180;
  spot.target.position.set(...((l.target ?? [0, 0, 0]) as [number, number, number])); // cast to tuple

  const rect = new THREE.RectAreaLight(col, l.intensity / 800, 2, 2);
  rect.position.set(...(l.position as [number, number, number])); // cast to tuple
  rect.lookAt(new THREE.Vector3(...((l.target ?? [0, 0, 0]) as [number, number, number])));

  const neon = new THREE.PointLight(col, l.intensity / 200, 5);
  neon.position.set(...(l.position as [number, number, number])); // cast to tuple
  light = neon;

  const p = new THREE.PointLight(col, l.intensity / 1000);
  p.position.set(...(l.position as [number, number, number])); // cast to tuple
  light = p;