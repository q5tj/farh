/**
 * Image compression + upload pipeline.
 *
 * - Resizes to max 1600px wide (aspect-preserving).
 * - Encodes as WEBP on Android/Web, JPEG on iOS (expo-image-manipulator
 *   doesn't ship a WEBP encoder on iOS as of SDK 54).
 * - Uploads via signed PUT URL so we can stream `xhr.upload.onprogress`.
 *
 * Usage:
 *   const job = uploadImage({ uri, bucket: 'provider-logos', authUserId,
 *                              fileName: 'logo', withPublicUrl: true,
 *                              onProgress });
 *   try { const { path, publicUrl } = await job.promise; }
 *   catch (e) { if (e instanceof UploadCancelledError) ... }
 */

import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

const PREFER_WEBP = Platform.OS === "android" || Platform.OS === "web";

export class UploadCancelledError extends Error {
  constructor() {
    super("Upload cancelled");
    this.name = "UploadCancelledError";
  }
}

export interface ProcessedImage {
  uri: string;
  ext: "webp" | "jpg";
  mime: "image/webp" | "image/jpeg";
  width: number;
  height: number;
}

interface CompressOptions {
  maxWidth?: number;
  /** 0..1, default 0.75 */
  quality?: number;
}

export async function compressImage(
  uri: string,
  opts: CompressOptions = {},
): Promise<ProcessedImage> {
  const { maxWidth = 1600, quality = 0.75 } = opts;
  const format = PREFER_WEBP ? SaveFormat.WEBP : SaveFormat.JPEG;
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: quality, format },
  );
  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    ext: PREFER_WEBP ? "webp" : "jpg",
    mime: PREFER_WEBP ? "image/webp" : "image/jpeg",
  };
}

export interface UploadResult {
  /** Storage object key within the bucket (e.g. "<auth_user_id>/logo.webp"). */
  path: string;
  /** Public URL — empty string when withPublicUrl is false / bucket is private. */
  publicUrl: string;
}

export interface UploadJob {
  promise: Promise<UploadResult>;
  cancel: () => void;
}

interface UploadOptions {
  uri: string;
  bucket: string;
  authUserId: string;
  /** File name without extension. E.g. "logo", "cr", "tax". */
  fileName: string;
  /** Generate a public URL (only meaningful for public buckets). */
  withPublicUrl?: boolean;
  compress?: CompressOptions;
  onProgress?: (pct: number) => void;
}

export function uploadImage(input: UploadOptions): UploadJob {
  if (!supabase) {
    return {
      promise: Promise.reject(new Error("Supabase not configured")),
      cancel: () => {},
    };
  }

  let xhr: XMLHttpRequest | null = null;
  let cancelled = false;

  const promise = (async () => {
    const processed = await compressImage(input.uri, input.compress);
    if (cancelled) throw new UploadCancelledError();

    const path = `${input.authUserId}/${input.fileName}.${processed.ext}`;

    const res = await fetch(processed.uri);
    if (cancelled) throw new UploadCancelledError();
    const blob = await res.blob();
    if (cancelled) throw new UploadCancelledError();

    const { data: signed, error: signErr } = await supabase!.storage
      .from(input.bucket)
      .createSignedUploadUrl(path);
    if (signErr) throw signErr;
    if (cancelled) throw new UploadCancelledError();

    await new Promise<void>((resolve, reject) => {
      xhr = new XMLHttpRequest();
      xhr.open("PUT", signed.signedUrl, true);
      xhr.setRequestHeader("Content-Type", processed.mime);
      xhr.setRequestHeader("x-upsert", "true");
      xhr.setRequestHeader("Authorization", `Bearer ${signed.token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && input.onProgress) {
          input.onProgress(e.loaded / e.total);
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.onabort = () => reject(new UploadCancelledError());
      xhr.onload = () => {
        if (xhr!.status >= 200 && xhr!.status < 300) resolve();
        else
          reject(
            new Error(`Upload failed: ${xhr!.status} ${xhr!.responseText}`),
          );
      };
      xhr.send(blob);
    });

    let publicUrl = "";
    if (input.withPublicUrl) {
      publicUrl = supabase!.storage.from(input.bucket).getPublicUrl(path).data
        .publicUrl;
    }
    return { path, publicUrl };
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (xhr) {
        try {
          xhr.abort();
        } catch {
          /* ignore */
        }
      }
    },
  };
}

/** Resolve a private storage path → temporary signed URL (default 1h TTL). */
export async function getSignedDocUrl(
  bucket: string,
  path: string,
  expiresIn = 3600,
): Promise<string | null> {
  if (!supabase || !path) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}
