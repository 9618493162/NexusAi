import { ReactNode, useEffect, useState } from "react";
import { api } from "@/services/api";

interface AvatarImageProps {
  /** Stored avatar path (e.g. "/api/auth/avatar/<uuid>.jpg") or an external URL. */
  src: string | null | undefined;
  alt?: string;
  className?: string;
  /** Rendered while loading, when the image fails, or when src is missing. */
  fallback?: ReactNode;
}

/**
 * Renders a profile photo. Local /api/auth/avatar/... paths live behind the
 * authenticated API, so they're fetched as a blob through the api client
 * (which attaches the Bearer token) and shown via an object URL. External
 * URLs (e.g. an OAuth-provided Google photo) render as a plain <img>. When
 * nothing can be shown (no src, still loading, or a load failure) the
 * `fallback` is rendered so callers keep showing initials instead of a blank
 * hole or a broken-image icon.
 */
export function AvatarImage({ src, alt = "", className, fallback = null }: AvatarImageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // External URLs need no auth; only local /api/... paths need the blob fetch.
  const isLocal = !!src && src.startsWith("/api/") && !/^https?:\/\//i.test(src);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setFailed(false);

    if (!src || !isLocal) return;

    // The api client's baseURL is `${API_URL}/api`, so strip the leading
    // "/api" from the stored absolute path before requesting.
    const rel = src.slice(4);
    api
      .get(rel, { responseType: "blob" })
      .then(({ data }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data as Blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        /* show the fallback */
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, isLocal]);

  if (!src || failed) return <>{fallback}</>;
  if (!isLocal) {
    return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
  }
  if (!url) return <>{fallback}</>;
  return <img src={url} alt={alt} className={className} />;
}
