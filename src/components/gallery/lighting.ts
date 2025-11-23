import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three-stdlib';
import { ROOM_SEGMENT_SIZE, WALL_HEIGHT } from './constants';

RectAreaLightUniformsLib.init();

export function setupLighting(scene: THREE.Scene) {
    scene.add(new THREE.AmbientLight(0x404050, 1.0));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, WALL_HEIGHT, 0);
    scene.add(hemiLight);

    // Cove Lighting
    const coveLightColor = 0x87CEEB;
    const coveLightIntensity = 10;
    const coveLightWidth = ROOM_SEGMENT_SIZE;
    const coveLightHeight = 0.1;
    const innerOffset = 0.1;
    const innerYPos = WALL_HEIGHT - 0.1;
    const wallThicknessOffset = 0.05;

    const createCoveLighting = (
        position: [number, number, number],
        rotation: [number, number, number],
        order: THREE.EulerOrder = 'XYZ'
    ) => {
        const rectLight = new THREE.RectAreaLight(coveLightColor, coveLightIntensity, coveLightWidth, coveLightHeight);
        rectLight.position.set(...position);
        rectLight.rotation.set(rotation[0], rotation[1], rotation[2], order);
        scene.add(rectLight);

        const glowGeo = new THREE.BoxGeometry(coveLightWidth, coveLightHeight, 0.02);
        const glowMat = new THREE.MeshBasicMaterial({ color: coveLightColor, toneMapped: false });
        const glowMesh = new THREE.Mesh(glowGeo, glowMat);
        glowMesh.position.set(...position);
        glowMesh.rotation.set(rotation[0], rotation[1], rotation[2], order);
        scene.add(glowMesh);
    };

    const innerSegmentCenters = [-20, -10, 0, 10, 20];
    const INNER_WALL_BOUNDARY = 25;

    innerSegmentCenters.forEach(segmentCenter => {
        createCoveLighting([segmentCenter, innerYPos, -INNER_WALL_BOUNDARY + innerOffset + wallThicknessOffset], [-Math.PI / 2, Math.PI, 0]);
        createCoveLighting([segmentCenter, innerYPos, INNER_WALL_BOUNDARY - innerOffset - wallThicknessOffset], [Math.PI / 2, Math.PI, 0]);
        createCoveLighting([INNER_WALL_BOUNDARY - innerOffset - wallThicknessOffset, innerYPos, segmentCenter], [Math.PI / 2, Math.PI / 2, 0], 'YXZ');
        createCoveLighting([-INNER_WALL_BOUNDARY + innerOffset + wallThicknessOffset, innerYPos, segmentCenter], [Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
    });

    const innerInnerSegmentCenters = [-10, 0, 10];
    const INNER_INNER_WALL_BOUNDARY_LIGHT = 15;

    innerInnerSegmentCenters.forEach(segmentCenter => {
        if (segmentCenter === 0) return;
        createCoveLighting([segmentCenter, innerYPos, -INNER_INNER_WALL_BOUNDARY_LIGHT + innerOffset - wallThicknessOffset], [Math.PI / 2, 0, 0]);
        createCoveLighting([segmentCenter, innerYPos, -INNER_INNER_WALL_BOUNDARY_LIGHT + innerOffset + wallThicknessOffset], [-Math.PI / 2, Math.PI, 0]);
        createCoveLighting([segmentCenter, innerYPos, INNER_INNER_WALL_BOUNDARY_LIGHT - innerOffset + wallThicknessOffset], [-Math.PI / 2, 0, 0]);
        createCoveLighting([segmentCenter, innerYPos, INNER_INNER_WALL_BOUNDARY_LIGHT - innerOffset - wallThicknessOffset], [Math.PI / 2, Math.PI, 0]);
        createCoveLighting([INNER_INNER_WALL_BOUNDARY_LIGHT - innerOffset + wallThicknessOffset, innerYPos, segmentCenter], [-Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
        createCoveLighting([INNER_INNER_WALL_BOUNDARY_LIGHT - innerOffset - wallThicknessOffset, innerYPos, segmentCenter], [Math.PI / 2, Math.PI / 2, 0], 'YXZ');
        createCoveLighting([-INNER_INNER_WALL_BOUNDARY_LIGHT + innerOffset - wallThicknessOffset, innerYPos, segmentCenter], [-Math.PI / 2, Math.PI / 2, 0], 'YXZ');
        createCoveLighting([-INNER_INNER_WALL_BOUNDARY_LIGHT + innerOffset + wallThicknessOffset, innerYPos, segmentCenter], [Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
    });

    const INNER_INNER_INNER_WALL_BOUNDARY = 5;
    innerInnerInnerSegmentCenters.forEach(segmentCenter => {
        createCoveLighting([segmentCenter, innerYPos, -INNER_INNER_INNER_WALL_BOUNDARY + innerOffset - wallThicknessOffset], [Math.PI / 2, 0, 0]);
        createCoveLighting([segmentCenter, innerYPos, -INNER_INNER_INNER_WALL_BOUNDARY + innerOffset + wallThicknessOffset], [-Math.PI / 2, Math.PI, 0]);
        createCoveLighting([segmentCenter, innerYPos, INNER_INNER_INNER_WALL_BOUNDARY - innerOffset + wallThicknessOffset], [-Math.PI / 2, 0, 0]);
        createCoveLighting([segmentCenter, innerYPos, INNER_INNER_INNER_WALL_BOUNDARY - innerOffset - wallThicknessOffset], [Math.PI / 2, Math.PI, 0]);
        createCoveLighting([INNER_INNER_INNER_WALL_BOUNDARY - innerOffset + wallThicknessOffset, innerYPos, segmentCenter], [-Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
        createCoveLighting([INNER_INNER_INNER_WALL_BOUNDARY - innerOffset - wallThicknessOffset, innerYPos, segmentCenter], [Math.PI / 2, Math.PI / 2, 0], 'YXZ');
        createCoveLighting([-INNER_INNER_INNER_WALL_BOUNDARY + innerOffset - wallThicknessOffset, innerYPos, segmentCenter], [-Math.PI / 2, Math.PI / 2, 0], 'YXZ');
        createCoveLighting([-INNER_INNER_INNER_WALL_BOUNDARY + innerOffset + wallThicknessOffset, innerYPos, segmentCenter], [Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
    });
}