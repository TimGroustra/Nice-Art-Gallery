@@
-    // -----------------------------------------------------------------
-    // Distance helper for collisions
-    // -----------------------------------------------------------------
-    function distToSegment(px: number, pz: number, x1: number, z1: number, x2: number, z2: number) {
-      const dx = x2 - x1;
-      const dz = z2 - z1;
-      const lenSq = dx * dx + dz * dz;
-      if (lenSq === 0) return Math.hypot(px - x1, pz - z1);
-      let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
-      t = Math.max(0, Math.min(1, t));
-      const cx = x1 + t * dx;
-      const cz = z1 + t * cz; // <-- error
-      return Math.hypot(px - cx, pz - cz);
-    }
-
-    // -----------------------------------------------------------------
-    // Load all panels after config init
-    // -----------------------------------------------------------------
+    // -----------------------------------------------------------------
+    // Load all panels after config init
+    // -----------------------------------------------------------------