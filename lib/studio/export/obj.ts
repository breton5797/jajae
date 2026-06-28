/**
 * lib/studio/export/obj.ts
 * Client-only: exports a THREE.Scene to an OBJ string using OBJExporter.
 */

import * as THREE from "three";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";

/**
 * Serialises a THREE.Scene to a Wavefront OBJ string.
 *
 * @param scene - The three.js scene to export.
 * @returns OBJ-formatted string.
 */
export function exportOBJ(scene: THREE.Scene): string {
  const exporter = new OBJExporter();
  return exporter.parse(scene);
}
