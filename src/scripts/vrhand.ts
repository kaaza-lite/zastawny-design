// The right hand holding a Quest 2 (right) controller, for the experimental page's VR pointer.
// Models (CC BY 4.0, trimmed to one hand / one controller and recoloured):
//   VR Hand by RockDutyFree_models  https://sketchfab.com/3d-models/vr-hand-a647cce524254c9a96d4244c12811d7a
//   Quest 2 Controller by BlackCube https://sketchfab.com/3d-models/quest-2-controller-low-mid-and-high-poly-9f02b77cc27148c986315674c7ed106d
// The hand is frozen at the gripping frame of its own animation, and the controller is placed in
// it from the hand's bones: the handle along the knuckles, pointing the way the hand points.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const GRIP_TIME = 16.5;     // s into the hand's animation: the gripping pose
const CONTROLLER_SCALE = 0.8;
const HAND_COLOUR = 0xd4d4d6;

export type VrHand = {
  rig: THREE.Group;          // origin at the palm
  forward: THREE.Vector3;    // the way the controller points, in rig space
  tip: THREE.Vector3;        // where the beam leaves the controller, in rig space
  dispose: () => void;
};

export async function loadVrHand(): Promise<VrHand> {
  const loader = new GLTFLoader();
  const [hand, ctrl] = await Promise.all([loader.loadAsync('/models/hand.glb'), loader.loadAsync('/models/controller.glb')]);

  const rig = new THREE.Group();
  rig.add(hand.scene);
  // The model's posed hand is a left hand; mirrored, it's the right hand that holds the right controller
  hand.scene.scale.x *= -1;

  // Freeze the hand in its gripping pose, light grey
  const mixer = new THREE.AnimationMixer(hand.scene);
  mixer.clipAction(hand.animations[0]).play();
  mixer.setTime(GRIP_TIME);
  hand.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const mesh = o as THREE.Mesh;
      mesh.material = new THREE.MeshStandardMaterial({ color: HAND_COLOUR, roughness: 0.75, metalness: 0 });
      mesh.frustumCulled = false; // a posed skinned mesh's box doesn't follow the pose
    }
  });
  rig.updateMatrixWorld(true);

  // The controller, centred in a pivot
  const pivot = new THREE.Group();
  ctrl.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(ctrl.scene);
  ctrl.scene.position.sub(box.getCenter(new THREE.Vector3()));
  ctrl.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).frustumCulled = false;
  });
  pivot.add(ctrl.scene);
  rig.add(pivot);

  // The controller's own directions (in the pivot): handle top → bottom, and forward (toward the trigger)
  const handleDir = new THREE.Vector3(0, -0.62, -0.78).normalize();
  const trigger = new THREE.Vector3(-0.01, -0.06, 0.5);
  const forwardDir = trigger.clone().sub(handleDir.clone().multiplyScalar(trigger.dot(handleDir))).normalize();
  const handleMid = new THREE.Vector3(0, -0.3, -0.15);
  const tipLocal = new THREE.Vector3(0, -0.02, 0.62);

  // The same directions on the hand, from its bones
  const at = (name: string) => hand.scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
  const indexBase = at('INDEX_BASE_joint_025');
  const pinkBase = at('PINK_BASE_joint_037');
  const fingerMid = at('INDEX_MID_joint_026').add(at('MIDDLE_F_MID_joint_030')).add(at('PINK_MID_joint_038')).multiplyScalar(1 / 3);
  const palm = at('HANDPALM_joint_024');
  const wrist = at('Root_joint_023');
  const H = pinkBase.clone().sub(indexBase).normalize();
  const F = palm.clone().sub(wrist);
  F.sub(H.clone().multiplyScalar(F.dot(H))).normalize();
  const S = new THREE.Vector3().crossVectors(H, F).normalize();
  const from = new THREE.Matrix4().makeBasis(handleDir, forwardDir, new THREE.Vector3().crossVectors(handleDir, forwardDir));
  const to = new THREE.Matrix4().makeBasis(H, F, S);
  pivot.quaternion.setFromRotationMatrix(to.multiply(from.invert()));
  pivot.scale.setScalar(CONTROLLER_SCALE);
  const centre = indexBase.clone().add(pinkBase).multiplyScalar(0.5).lerp(fingerMid, 0.5);
  pivot.position.copy(centre).sub(handleMid.clone().multiplyScalar(CONTROLLER_SCALE).applyQuaternion(pivot.quaternion));

  // Put the rig's origin at the palm
  hand.scene.position.sub(palm);
  pivot.position.sub(palm);
  rig.updateMatrixWorld(true);
  const forward = forwardDir.clone().applyQuaternion(pivot.quaternion).normalize();
  const tip = pivot.localToWorld(tipLocal.clone());

  return {
    rig,
    forward,
    tip,
    dispose: () => {
      rig.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          for (const v of Object.values(m)) if ((v as THREE.Texture)?.isTexture) (v as THREE.Texture).dispose();
          m.dispose();
        }
      });
    },
  };
}
