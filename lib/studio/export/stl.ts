/**
 * lib/studio/export/stl.ts
 * Client-only: exports a THREE.Scene to an ASCII STL string using STLExporter.
 * ASCII mode is preferred for readability; binary flag left false (default).
 */

import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

/**
 * Serialises a THREE.Scene to an ASCII STL string.
 *
 * @param scene - The three.js scene to export.
 * @returns ASCII STL string.
 */
export function exportSTL(scene: THREE.Scene): string {
  const exporter = new STLExporter();
  return exporter.parse(scene, { binary: false }) as string;
}
