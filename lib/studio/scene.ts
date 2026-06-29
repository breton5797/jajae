/**
 * Pure, immutable 3D scene manipulation functions.
 * No side effects, no Math.random, no Date, no console.log.
 * All functions return new scene objects; originals are never mutated.
 */
import type { DesignScene, SceneObject, StudioDomain, Transform3D } from "@/lib/types";

const IDENTITY_TRANSFORM: Transform3D = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

/** Create a fresh DesignScene with sensible defaults for the given domain. */
export function emptyScene(domain: StudioDomain): DesignScene {
  return {
    id: `scene-${domain}`,
    domain,
    objects: [],
    ground: { type: "floor", sizeM: 20 },
    camera: {
      position: [8, 6, 8],
      target: [0, 0, 0],
    },
  };
}

/**
 * Append a new SceneObject to the scene.
 * id is deterministic: `obj-${scene.objects.length + 1}`.
 * transform defaults to identity if omitted.
 */
export function addObject(
  scene: DesignScene,
  assetId: string,
  name: string,
  transform?: Transform3D,
): DesignScene {
  const newObject: SceneObject = {
    id: `obj-${scene.objects.length + 1}`,
    assetId,
    name,
    transform: transform ?? { ...IDENTITY_TRANSFORM },
  };

  return {
    ...scene,
    objects: [...scene.objects, newObject],
  };
}

/** Remove the SceneObject with the given id. No-op if id not found. */
export function removeObject(scene: DesignScene, id: string): DesignScene {
  return {
    ...scene,
    objects: scene.objects.filter((obj) => obj.id !== id),
  };
}

/**
 * Shallow-merge patch into the matching SceneObject.
 * If patch.transform is provided, it replaces the existing transform entirely
 * (deep merge would require field-by-field spreading which is done below).
 */
export function updateObject(
  scene: DesignScene,
  id: string,
  patch: Partial<SceneObject>,
): DesignScene {
  return {
    ...scene,
    objects: scene.objects.map((obj) => {
      if (obj.id !== id) return obj;

      const mergedTransform =
        patch.transform !== undefined
          ? { ...obj.transform, ...patch.transform }
          : obj.transform;

      return {
        ...obj,
        ...patch,
        transform: mergedTransform,
      };
    }),
  };
}

/** Move a SceneObject to a new position (leaves rotation and scale unchanged). */
export function moveObject(
  scene: DesignScene,
  id: string,
  position: [number, number, number],
): DesignScene {
  return {
    ...scene,
    objects: scene.objects.map((obj) => {
      if (obj.id !== id) return obj;

      return {
        ...obj,
        transform: {
          ...obj.transform,
          position,
        },
      };
    }),
  };
}
