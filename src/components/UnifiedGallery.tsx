// ... (previous code remains the same until line 762)
    // Input event listeners
    const setupInputListeners = () => {
      if (isMobile) {
        const container = mountRef.current!;
        container.addEventListener('touchstart', (e) => {
          isDraggingRef.current = false;
          touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        });
        
        container.addEventListener('touchmove', (e) => {
          isDraggingRef.current = true;
          const deltaX = e.touches[0].clientX - touchStartRef.current.x;
          const deltaY = e.touches[0].clientY - touchStartRef.current.y;
          rotationRef.current.yaw += deltaX * 0.005;
          rotationRef.current.pitch += deltaY * 0.005;
          rotationRef.current.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, rotationRef.current.pitch));
          touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        });
        
        container.addEventListener('touchend', onClick);
      } else {
        const onKeyDown = (e: KeyboardEvent) => {
          if (e.code === 'KeyW') moveForwardRef.current = true;
          if (e.code === 'KeyA') moveLeftRef.current = true;
          if (e.code === 'KeyS') moveBackwardRef.current = true;
          if (e.code === 'KeyD') moveRightRef.current = true;
        };
        
        const onKeyUp = (e: KeyboardEvent) => {
          if (e.code === 'KeyW') moveForwardRef.current = false;
          if (e.code === 'KeyA') moveLeftRef.current = false;
          if (e.code === 'KeyS') moveBackwardRef.current = false;
          if (e.code === 'KeyD') moveRightRef.current = false;
        };
        
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        
        return () => {
          document.removeEventListener('keydown', onKeyDown);
          document.removeEventListener('keyup', onKeyUp);
        };
      }
      
      return () => {}; // No cleanup for mobile touch events
    };

    const cleanupInputs = setupInputListeners();

    // Loading initialization - handle gracefully if Supabase not available
    let stopLoad = false;
    const initLoad = async () => {
      try {
        await initializeGalleryConfig();
      } catch (error) {
        console.warn("Gallery config initialization failed, continuing with default setup:", error);
      }
      
      const total = panelsRef.current.length;
      for (let i = 0; i < total; i++) {
        if (stopLoad) break;
        const p = panelsRef.current[i];
        
        try {
          await updatePanelContent(p, getCurrentNftSource(p.wallName));
        } catch (error) {
          console.warn(`Failed to load panel ${p.wallName}:`, error);
        }
        
        if (onLoadingProgress) {
          onLoadingProgress((i + 1) / total * 100);
        }

        if (i % 2 === 0) {
          await new Promise(r => setTimeout(r, 50));
        }
      }
      
      if (!stopLoad && onLoadingComplete) {
        onLoadingComplete();
      }
    };
    initLoad();

    // Animation loop
    const animate = () => {
      if (stopLoad) return;
      const time = performance.now();
      const delta = (time - prevTimeRef.current) / 1000;
      prevTimeRef.current = time;

      // Update camera based on device type
      if (isMobile && isStarted) {
        if (camera) {
          camera.rotation.set(rotationRef.current.pitch, rotationRef.current.yaw, 0);
          if (isWalkingRef.current && !isTeleportingRef.current) {
            const moveSpeed = 3.4;
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            forward.y = 0;
            forward.normalize();
            const nextX = new THREE.Vector3(camera.position.x + forward.x * moveSpeed * delta, camera.position.y, camera.position.z);
            if (!checkCollision(nextX)) camera.position.x = nextX.x;
            const nextZ = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z + forward.z * moveSpeed * delta);
            if (!checkCollision(nextZ)) camera.position.z = nextZ.z;
          }
        }
      } else if (!isMobile && controls?.isLocked) {
        const vel = velocityRef.current; 
        const dir = directionRef.current;
        dir.z = Number(moveForwardRef.current) - Number(moveBackwardRef.current);
        dir.x = Number(moveRightRef.current) - Number(moveLeftRef.current);
        dir.normalize();
        
        if (moveForwardRef.current || moveBackwardRef.current) vel.z -= dir.z * 20.0 * delta;
        if (moveLeftRef.current || moveRightRef.current) vel.x -= dir.x * 20.0 * delta;
        
        vel.x -= vel.x * 10.0 * delta; 
        vel.z -= vel.z * 10.0 * delta;
        
        controls.moveRight(-vel.x * delta); 
        controls.moveForward(-vel.z * delta);
        
        camera.position.x = Math.max(-BOUNDARY, Math.min(BOUNDARY, camera.position.x));
        camera.position.z = Math.max(-BOUNDARY, Math.min(BOUNDARY, camera.position.z));
      }

      // Update shared animations
      if (rainbowMaterial) rainbowMaterial.uniforms.time.value += delta;
      
      teleportButtonsRef.current.forEach(btn => {
        const { electron1, electron2, diamond } = btn.userData;
        if (diamond) {
          diamond.rotation.y += delta * 0.5;
          diamond.position.y = Math.sin(time * 0.002) * 0.1;
        }
        if (electron1) electron1.rotation.y += delta * 2;
        if (electron2) electron2.rotation.y -= delta * 1.5;
      });

      if (fadeScreenRef.current) { 
        fadeScreenRef.current.position.copy(camera.position); 
        fadeScreenRef.current.quaternion.copy(camera.quaternion); 
      }
      
      if (isTeleportingRef.current && fadeMaterialRef.current) {
        const elapsed = (time - fadeStartTimeRef.current) / 1000;
        if (elapsed < FADE_DURATION) fadeMaterialRef.current.opacity = elapsed / FADE_DURATION;
        else if (elapsed < 2 * FADE_DURATION) fadeMaterialRef.current.opacity = 1 - (elapsed - FADE_DURATION) / FADE_DURATION;
        else { fadeMaterialRef.current.opacity = 0; isTeleportingRef.current = false; }
      }

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      stopLoad = true;
      cleanupInputs();
      window.removeEventListener('resize', onResize);
      panelsRef.current.forEach(p => { 
        disposeTextureSafely(p.mesh); 
        p.videoElement?.pause(); 
        p.gifStopFunction?.(); 
      });
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
      (window as any).galleryControls = undefined;
    };
  }, [isMobile, handleStart, updatePanelContent, checkCollision, onLoadingProgress, onLoadingComplete]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black touch-none">
      <div ref={mountRef} className="w-full h-full touch-none" />
      
      {/* Configuration Warning */}
      {(import.meta.env.VITE_SUPABASE_URL?.includes('your-project-ref') || 
        import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.includes('your-walletconnect-project-id')) && (
        <div className="absolute top-2 left-2 z-50 bg-yellow-500/80 text-black px-3 py-1 rounded text-xs font-medium animate-pulse">
          Configure environment variables
        </div>
      )}
      
      {/* ... rest of the component remains the same */}
    </div>
  );
};