import type { NavigateFunction } from "react-router-dom";
import type { SearchResult } from "@/services/search.service";

/**
 * Every search result opens the REAL resource on its existing page:
 * conversation/message → /chat/:id · file → /files?open=:id ·
 * audio session → /voice?session=:id · local image → /image-studio.
 */
export function openSearchResult(result: SearchResult, navigate: NavigateFunction): void {
  switch (result.type) {
    case "conversation":
      navigate(`/chat/${result.id}`);
      break;
    case "message":
      navigate(`/chat/${result.meta.conversationId || result.id}`);
      break;
    case "file":
      navigate(`/files?open=${result.id}`);
      break;
    case "audio":
      navigate(`/voice?session=${result.id}`);
      break;
    case "image":
      navigate("/image-studio");
      break;
  }
}
