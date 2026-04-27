/**
 * XHR-based image upload with progress + cancel.
 *
 * Supabase Storage's `upload()` doesn't expose progress. We work around it
 * by getting a signed upload URL and POSTing via XHR (which exposes
 * `xhr.upload.onprogress`).
 *
 * Usage:
 *   const job = uploadAvatarWithProgress({ uri, ext, userId, onProgress });
 *   try { const url = await job.promise; } finally { job.cancel(); }
 */

import { supabase } from "@/lib/supabase";

export interface UploadJob {
  promise: Promise<string>; // resolves to public URL
  cancel: () => void;
}

interface UploadInput {
  uri: string;
  ext: string;
  authUserId: string;
  mimeType?: string;
  onProgress?: (pct: number) => void;
}

export class UploadCancelledError extends Error {
  constructor() {
    super("Upload cancelled");
    this.name = "UploadCancelledError";
  }
}

export function uploadAvatarWithProgress(input: UploadInput): UploadJob {
  if (!supabase) {
    return {
      promise: Promise.reject(new Error("Supabase not configured")),
      cancel: () => {},
    };
  }

  const { uri, ext, authUserId, onProgress } = input;
  const path = `${authUserId}/${Date.now()}.${ext}`;
  const mime =
    input.mimeType ?? `image/${ext === "jpg" ? "jpeg" : ext}`;

  let xhr: XMLHttpRequest | null = null;
  let cancelled = false;

  const promise = (async () => {
    // 1) Resolve the URI to a Blob (works for RN file://, content://, and http URIs)
    const blobRes = await fetch(uri);
    if (cancelled) throw new UploadCancelledError();
    const blob = await blobRes.blob();
    if (cancelled) throw new UploadCancelledError();

    // 2) Get signed upload URL from Supabase
    const { data: signed, error: signErr } = await supabase!
      .storage
      .from("avatars")
      .createSignedUploadUrl(path);
    if (signErr) throw signErr;
    if (cancelled) throw new UploadCancelledError();

    // 3) Upload via XHR for progress events
    const finalUrl: string = await new Promise<string>((resolve, reject) => {
      xhr = new XMLHttpRequest();
      xhr.open("PUT", signed.signedUrl, true);
      xhr.setRequestHeader("Content-Type", mime);
      xhr.setRequestHeader("x-upsert", "true");
      // Authorization is embedded in signedUrl as a token; some clients
      // also require this header to mirror — set it defensively:
      xhr.setRequestHeader("Authorization", `Bearer ${signed.token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(e.loaded / e.total);
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.onabort = () => reject(new UploadCancelledError());
      xhr.onload = () => {
        if (xhr!.status >= 200 && xhr!.status < 300) {
          resolve(signed.path ?? path);
        } else {
          reject(new Error(`Upload failed: ${xhr!.status} ${xhr!.responseText}`));
        }
      };
      xhr.send(blob);
    });

    // 4) Resolve to public URL
    const { data } = supabase!.storage.from("avatars").getPublicUrl(finalUrl);
    return data.publicUrl;
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
