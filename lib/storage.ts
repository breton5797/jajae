"use client";

import { createClient } from "@/lib/supabase/client";

export const DRAWINGS_BUCKET = "drawings";
export const SITE_DOCS_BUCKET = "site-docs";

/** Read a File as a base64 string (no data: prefix) for Claude vision. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("file read error"));
    reader.readAsDataURL(file);
  });
}

export interface UploadResult {
  path: string | null;
  error: string | null;
}

/** Upload a file to a Storage bucket under the current user's folder. */
export async function uploadToBucket(
  bucket: string,
  file: File,
): Promise<UploadResult> {
  try {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return { path: null, error: "로그인이 필요합니다." };

    const safeName = file.name.replace(/[^\w.\-가-힣]/g, "_");
    const path = `${user.id}/${Date.now()}_${safeName}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) return { path: null, error: error.message };
    return { path, error: null };
  } catch (e) {
    return { path: null, error: (e as Error).message };
  }
}
