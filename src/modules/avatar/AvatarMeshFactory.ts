import * as THREE from "three";
import { AvatarProfile } from "./AvatarTypes";

export function createAvatarMesh(profile: AvatarProfile): THREE.Group {
  const avatar = new THREE.Group();
  avatar.name = "avatar";

  const skinMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(profile.skinTone),
    roughness: 0.8,
    metalness: 0.1
  });
  
  const hairMat = new THREE.MeshStandardMaterial({ 
    color: new THREE.Color(profile.hairColor),
    roughness: 0.5,
    metalness: 0.2
  });

  // Torso (Capsule)
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.25, 0.6),
    skinMat
  );
  torso.scale.set(profile.build, profile.height, profile.build);
  torso.position.y = 0.3 * profile.height; // Center torso around 0.3 * height
  avatar.add(torso);

  // Head (Sphere)
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.18),
    skinMat
  );
  // Position head above torso
  head.position.y = 0.7 * profile.height + 0.3; 
  head.scale.setScalar(profile.headSize);
  avatar.add(head);

  // Legs (Cylinders)
  const legGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.6);
  const leftLeg = new THREE.Mesh(legGeo, skinMat);
  const rightLeg = leftLeg.clone();

  // Position legs below the origin (torso base is at y=0)
  leftLeg.position.set(-0.1 * profile.build, -0.3, 0);
  rightLeg.position.set(0.1 * profile.build, -0.3, 0);

  avatar.add(leftLeg, rightLeg);

  // Hair
  if (profile.hairStyle !== "none") {
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.19),
      hairMat
    );
    hair.position.copy(head.position);
    hair.scale.y = profile.hairStyle === "bun" ? 0.6 : 0.8;
    hair.position.y += 0.05 * profile.headSize; // Lift slightly above head
    avatar.add(hair);
  }

  // Beard
  if (profile.hasBeard) {
    const beard = new THREE.Mesh(
      new THREE.BoxGeometry(0.2 * profile.build, 0.1 * profile.headSize, 0.15 * profile.headSize),
      hairMat
    );
    beard.position.set(0, head.position.y - 0.15 * profile.headSize, 0.18 * profile.headSize);
    avatar.add(beard);
  }
  
  // Set the overall avatar position to stand on the ground (y=0)
  avatar.position.y = 0.3; // Half the leg height (0.6/2)

  return avatar;
}