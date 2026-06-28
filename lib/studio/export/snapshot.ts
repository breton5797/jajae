/**
 * lib/studio/export/snapshot.ts
 * Client-only: captures the r3f canvas as a PNG data-URL.
 *
 * Reliability strategy (two layers):
 *  1. scene-canvas.tsx sets gl={{ preserveDrawingBuffer: true }} on <Canvas>.
 *  2. We call gl.render() synchronously before toDataURL() so the framebuffer
 *     is guaranteed to be populated even across ticks.
 */

import * as THREE from "three";

export interface ThreeCtx {
  scene: THREE.Scene;
  gl: THREE.WebGLRenderer;
  camera: THREE.Camera;
}

/**
 * Renders the scene and captures the WebGL canvas as a PNG data-URL.
 *
 * @param ctx - The three.js context (scene, renderer, camera).
 * @returns A "data:image/png;base64,..." string suitable for download or display.
 */
export function exportPNG(ctx: ThreeCtx): string {
  // Synchronous render → fills the drawing buffer in the same tick.
  ctx.gl.render(ctx.scene, ctx.camera);
  return ctx.gl.domElement.toDataURL("image/png");
}
