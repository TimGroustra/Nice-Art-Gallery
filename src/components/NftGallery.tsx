@@
-    GalleryLayout.walls.forEach(wall => {
+    GalleryLayout.walls.forEach(wall => {
@@
-      if (wall.hasPanel) {
+      // Only create NFT panels for walls that are NOT the decorative spiral.
+      if (wall.hasPanel && !wall.key.startsWith('spiral-nft-')) {
*** End Patch