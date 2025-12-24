// src/components/MobileGallery.tsx

// ... (imports and component definition) ...

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x000000);

    const cameraInstance = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    cameraInstance.position.set(0, 1.6, -20);
    setCamera(cameraInstance); // Set camera state

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current = renderer;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // FIX: Apply touch-action: none to the canvas to prevent browser gestures (like pull-to-refresh)
    renderer.domElement.style.touchAction = 'none'; 
    
    mountRef.current.appendChild(renderer.domElement);
    setRendererDomElement(renderer.domElement); // Set rendererDomElement state

    // ... (rest of useEffect logic) ...