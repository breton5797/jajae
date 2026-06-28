/**
 * lib/studio/export/gltf.ts
 * Client-only: exports a THREE.Scene to a .glb Blob using GLTFExporter.
 * Uses the async parseAsync API for clean Promise-based usage.
 */

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const GLTF_MIME = "model/gltf-binary";

/**
 * Serialises a THREE.Scene to a GLB ArrayBuffer and wraps it in a Blob.
 *
 * @param scene - The three.js scene to export.
 * @returns A Blob with MIME type "model/gltf-binary".
 */
export async function exportGLB(scene: THREE.Scene): Promise<Blob> {
  const exporter = new GLTFExporter();

  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else {
          reject(new Error("GLTFExporter: expected ArrayBuffer for binary export"));
        }
      },
      (error) => reject(new Error(`GLTFExporter failed: ${String(error)}`)),
      { binary: true },
    );
  });

  return new Blob([buffer], { type: GLTF_MIME });
}
