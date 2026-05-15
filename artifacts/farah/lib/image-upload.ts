/**
 * Image compression + upload pipeline.
 *
 * - Resizes to max 1600px wide (aspect-preserving).
 * - Encodes as WEBP on Android, JPEG on iOS / Web.
 * - Uploads via XMLHttpRequest against the Supabase Storage REST endpoint
 *   (NOT the supabase-js SDK, which uses fetch() and can't expose upload
 *   progress). This gives us a real moving progress bar, the ability to
 *   abort mid-flight, a hard timeout, and explicit error messages instead
 *   of a silently-pending promise when the network or CORS misbehaves.
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

// WEBP encoding is reliable on Android only via expo-image-manipulator; iOS
// and web need to fall back to JPEG to avoid silent encoder failures.
const PREFER_WEBP = Platform.OS === "android";

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
  try {
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
  } catch (err) {
    // Web canvas + WEBP encoding is unreliable in some browsers; fall back
    // to the original URI so the upload still succeeds. We treat it as
    // jpeg — the bucket allows jpeg/png/webp and Supabase trusts the
    // contentType we send rather than the bytes themselves.
    console.warn("[image-upload] compress fallback to original", err);
    return {
      uri,
      width: 0,
      height: 0,
      ext: "jpg",
      mime: "image/jpeg",
    };
  }
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

  let cancelled = false;
  let activeXhr: XMLHttpRequest | null = null;

  const promise = (async () => {
    const processed = await compressImage(input.uri, input.compress);
    if (cancelled) throw new UploadCancelledError();

    const path = `${input.authUserId}/${input.fileName}.${processed.ext}`;

    const res = await fetch(processed.uri);
    if (cancelled) throw new UploadCancelledError();
    const blob = await res.blob();
    if (cancelled) throw new UploadCancelledError();

    await xhrUploadToSupabaseStorage({
      bucket: input.bucket,
      path,
      blob,
      contentType: processed.mime,
      onProgress: input.onProgress,
      isCancelled: () => cancelled,
      setActiveXhr: (xhr) => {
        activeXhr = xhr;
      },
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
      try {
        activeXhr?.abort();
      } catch {
        // ignore — abort can throw if xhr is in an unusual state
      }
    },
  };
}

/**
 * Upload a blob to Supabase Storage via XHR, exposing real progress events.
 *
 * The supabase-js SDK uses fetch() internally, which provides no upload
 * progress on web — so we hit the REST endpoint directly. This also lets
 * us abort mid-flight and surface CORS/network errors clearly instead of
 * leaving the promise pending.
 */
async function xhrUploadToSupabaseStorage(args: {
  bucket: string;
  path: string;
  blob: Blob;
  contentType: string;
  onProgress?: (pct: number) => void;
  isCancelled: () => boolean;
  setActiveXhr: (xhr: XMLHttpRequest) => void;
}): Promise<void> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) throw new Error("Supabase URL not configured");

  // Fall back to the anon key if no user JWT is present — the bucket's RLS
  // policies decide what the request can actually do. Both keys are publishable.
  const { data } = await supabase!.auth.getSession();
  const accessToken =
    data?.session?.access_token ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!accessToken) throw new Error("Not authenticated");

  if (args.isCancelled()) throw new UploadCancelledError();

  return new Promise<void>((resolve, reject) => {
    const url = `${supabaseUrl}/storage/v1/object/${args.bucket}/${args.path}`;
    const xhr = new XMLHttpRequest();
    args.setActiveXhr(xhr);

    xhr.open("POST", url, true);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("Cache-Control", "max-age=3600");
    if (args.contentType) {
      xhr.setRequestHeader("Content-Type", args.contentType);
    }

    // 2 min hard cap — large blobs over slow links would otherwise hang.
    xhr.timeout = 120_000;

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || e.total === 0) return;
      // Reserve the last 5% for the server's commit so the bar doesn't
      // sit at 100% while we wait for the response.
      const pct = Math.min(0.95, e.loaded / e.total);
      args.onProgress?.(pct);
    };

    xhr.onload = () => {
      if (args.isCancelled()) {
        reject(new UploadCancelledError());
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        args.onProgress?.(1);
        resolve();
        return;
      }
      // Supabase returns JSON errors like { statusCode, error, message }
      let message = `Upload failed (HTTP ${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText);
        if (body?.message) message = body.message;
        else if (body?.error) message = body.error;
      } catch {
        // body wasn't JSON — keep the default message
      }
      reject(new Error(message));
    };

    xhr.onerror = () => {
      reject(new Error("Network error during upload"));
    };

    xhr.ontimeout = () => {
      reject(new Error("Upload timed out"));
    };

    xhr.onabort = () => {
      reject(new UploadCancelledError());
    };

    args.onProgress?.(0);
    xhr.send(args.blob);
  });
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

// ============================================================
// Generic media uploader (gallery: image / video / file)
// ============================================================

export type MediaKind = "image" | "video" | "file";

export interface MediaUploadResult {
  kind: MediaKind;
  path: string;
  publicUrl: string;
  /** Set only for videos — points at a public JPEG poster frame. */
  thumbnailPath?: string;
  thumbnailUrl?: string;
  mimeType: string;
  sizeBytes: number;
}

interface MediaUploadInput {
  uri: string;
  kind: MediaKind;
  authUserId: string;
  bucket: string;
  /** Random/unique stem within the user's folder; ext is added automatically. */
  fileName: string;
  /** Original asset mime/ext when known (videos + files). */
  mimeType?: string;
  fileExt?: string;
  onProgress?: (pct: number) => void;
}

const VIDEO_MAX_BYTES = 60 * 1024 * 1024; // 60 MB — matches the bucket cap.
const FILE_MAX_BYTES = 15 * 1024 * 1024; // 15 MB — generous for PDFs.

async function blobFromUri(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return res.blob();
}

function deriveExtFromMime(mime: string | undefined, fallback: string): string {
  if (!mime) return fallback;
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "application/pdf": "pdf",
  };
  return map[mime.toLowerCase()] ?? fallback;
}

export interface MediaUploadJob {
  promise: Promise<MediaUploadResult>;
  cancel: () => void;
}

export function uploadGalleryMedia(input: MediaUploadInput): MediaUploadJob {
  if (!supabase) {
    return {
      promise: Promise.reject(new Error("Supabase not configured")),
      cancel: () => {},
    };
  }

  let cancelled = false;
  let activeXhr: XMLHttpRequest | null = null;

  const promise = (async (): Promise<MediaUploadResult> => {
    if (input.kind === "image") {
      // Reuse the compress path. Gallery images stay at 1600px wide.
      const job = uploadImage({
        uri: input.uri,
        bucket: input.bucket,
        authUserId: input.authUserId,
        fileName: input.fileName,
        withPublicUrl: true,
        compress: { maxWidth: 1600, quality: 0.75 },
        onProgress: input.onProgress,
      });
      const { path, publicUrl } = await job.promise;
      return {
        kind: "image",
        path,
        publicUrl,
        mimeType: PREFER_WEBP ? "image/webp" : "image/jpeg",
        sizeBytes: 0,
      };
    }

    // Resolve the original blob first so we can size-check + upload.
    const blob = await blobFromUri(input.uri);
    if (cancelled) throw new UploadCancelledError();

    if (input.kind === "video" && blob.size > VIDEO_MAX_BYTES) {
      throw new Error(
        `Video too large (${Math.round(blob.size / 1024 / 1024)} MB). Max ${VIDEO_MAX_BYTES / 1024 / 1024} MB.`,
      );
    }
    if (input.kind === "file" && blob.size > FILE_MAX_BYTES) {
      throw new Error(
        `File too large (${Math.round(blob.size / 1024 / 1024)} MB). Max ${FILE_MAX_BYTES / 1024 / 1024} MB.`,
      );
    }

    const ext = deriveExtFromMime(
      input.mimeType,
      input.fileExt ?? (input.kind === "video" ? "mp4" : "bin"),
    );
    const mime = input.mimeType ?? (input.kind === "video" ? "video/mp4" : "application/octet-stream");
    const path = `${input.authUserId}/${input.fileName}.${ext}`;

    // Reserve the last slice of the bar for the optional thumbnail step.
    const mainCap = input.kind === "video" ? 0.7 : 1;
    await xhrUploadToSupabaseStorage({
      bucket: input.bucket,
      path,
      blob,
      contentType: mime,
      onProgress: (p) => input.onProgress?.(p * mainCap),
      isCancelled: () => cancelled,
      setActiveXhr: (xhr) => {
        activeXhr = xhr;
      },
    });
    if (cancelled) throw new UploadCancelledError();

    let thumbnailPath: string | undefined;
    let thumbnailUrl: string | undefined;

    if (input.kind === "video") {
      // Best-effort poster frame — if the thumbnail path fails we still keep
      // the video; the gallery renderer falls back to a generic icon.
      try {
        const { getThumbnailAsync } = await import("expo-video-thumbnails");
        const thumb = await getThumbnailAsync(input.uri, {
          time: 1000,
          quality: 0.7,
        });
        if (cancelled) throw new UploadCancelledError();
        const thumbJob = uploadImage({
          uri: thumb.uri,
          bucket: input.bucket,
          authUserId: input.authUserId,
          fileName: `${input.fileName}.thumb`,
          withPublicUrl: true,
          compress: { maxWidth: 800, quality: 0.7 },
        });
        const { path: tp, publicUrl: tu } = await thumbJob.promise;
        thumbnailPath = tp;
        thumbnailUrl = tu;
      } catch (err) {
        console.warn("[image-upload] video thumbnail skipped", err);
      }
    }

    input.onProgress?.(1);

    const publicUrl = supabase!.storage
      .from(input.bucket)
      .getPublicUrl(path).data.publicUrl;

    return {
      kind: input.kind,
      path,
      publicUrl,
      thumbnailPath,
      thumbnailUrl,
      mimeType: mime,
      sizeBytes: blob.size,
    };
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      try {
        activeXhr?.abort();
      } catch {
        // ignore
      }
    },
  };
}

/** Best-effort delete; ignores errors so callers don't block on cleanup. */
export async function deleteStorageObject(
  bucket: string,
  path: string,
): Promise<void> {
  if (!supabase || !path) return;
  await supabase.storage.from(bucket).remove([path]).catch(() => {});
}
