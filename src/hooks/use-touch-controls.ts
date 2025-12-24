import * as THREE from 'three';
import { useRef, useEffect, useCallback } from 'react';

interface TouchControlsProps {
  camera: THREE.PerspectiveCamera | null;
  rendererDomElement: HTMLElement | null;
  isMobile: boolean;
  isWalking: boolean;
  onInteraction: (event: MouseEvent | TouchEvent) => void;
}

const MAX_PITCH = Math.PI / 2 - 0.1; // Clamp vertical look
const MIN_PITCH = -Math.PI / 2 + 0.1;

/**
 * Custom controls hook for mobile touch interaction (drag to look, external state to walk).
 */
export function useTouchControls({
  camera,
  rendererDomElement,
  isMobile,
  isWalking,
  onInteraction,
}: TouchControlsProps) {
  const isDragging = useRef(false);
  const hasMoved = useRef(false); // Track if movement occurred during touch
  const previousTouch = useRef<{ x: number; y: number } | null>(null);
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const PI_2 = Math.PI / 2;

  // Initialize euler rotation based on camera's current rotation
  useEffect(() => {
    if (camera) {
      euler.current.setFromQuaternion(camera.quaternion);
    }
  }, [camera]);

  const handleTouchStart = useCallback((event: TouchEvent) => {
    if (event.touches.length === 1) {
      event.preventDefault(); // Prevent scrolling/zooming
      isDragging.current = true;
      hasMoved.current = false;
      previousTouch.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    }
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    if (!isDragging.current || event.touches.length !== 1 || !camera) return;

    event.preventDefault(); // Prevent scrolling/zooming

    const touch = event.touches[0];
    const deltaX = touch.clientX - (previousTouch.current?.x ?? touch.clientX);
    const deltaY = touch.clientY - (previousTouch.current?.y ?? touch.clientY);

    // Check if movement is significant enough to count as a drag
    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
        hasMoved.current = true;
    }

    // Sensitivity factor (adjust as needed)
    const sensitivity = 0.005;

    // Update Euler angles
    euler.current.y -= deltaX * sensitivity;
    euler.current.x -= deltaY * sensitivity;

    // Clamp vertical look
    euler.current.x = Math.max(MIN_PITCH, Math.min(MAX_PITCH, euler.current.x));

    // Apply rotation to camera
    camera.quaternion.setFromEuler(euler.current);

    previousTouch.current = { x: touch.clientX, y: touch.clientY };
  }, [camera]);

  const handleTouchEnd = useCallback((event: TouchEvent) => {
    isDragging.current = false;
    previousTouch.current = null;
    
    // If no significant movement occurred, treat it as a tap/interaction
    if (!hasMoved.current) {
        // We call onInteraction here instead of in a separate listener
        // to ensure we only trigger interaction if it wasn't a drag.
        onInteraction(event);
    }
    hasMoved.current = false;
  }, [onInteraction]);

  useEffect(() => {
    if (!rendererDomElement || !isMobile) return;

    // Use non-passive listeners to allow event.preventDefault()
    rendererDomElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    rendererDomElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    rendererDomElement.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    // Remove redundant listeners
    rendererDomElement.removeEventListener('click', onInteraction);
    // rendererDomElement.removeEventListener('touchend', handleTap); // Removed handleTap logic

    return () => {
      rendererDomElement.removeEventListener('touchstart', handleTouchStart);
      rendererDomElement.removeEventListener('touchmove', handleTouchMove);
      rendererDomElement.removeEventListener('touchend', handleTouchEnd);
    };
  }, [rendererDomElement, isMobile, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Expose movement logic for the animation loop
  const updateMovement = useCallback((delta: number) => {
    if (!camera) return;

    const speed = 5.0; // Slow, gallery-appropriate pace

    if (isWalking) {
      // Move forward in the direction the camera is facing (on the XZ plane)
      const forwardVector = new THREE.Vector3(0, 0, -1);
      forwardVector.applyQuaternion(camera.quaternion);
      
      // Project onto the XZ plane and normalize
      forwardVector.y = 0;
      forwardVector.normalize();

      camera.position.addScaledVector(forwardVector, speed * delta);
    }
  }, [camera, isWalking]);

  return { updateMovement };
}