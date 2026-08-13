export interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  /** light | dark | system — saved to the account, follows across devices. */
  theme?: string;
  /** Speech-recognition language for live dictation — saved to the account, follows across devices. */
  dictateLang?: string | null;
  /** Translation target for dictated speech — saved to the account, follows across devices. */
  dictateTo?: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  messages?: Array<{ content: string; createdAt: string }>;
}

export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant" | "system";
  model?: string;
  /** Language code the reply was spoken in (e.g. "te") — replays use it. */
  language?: string;
  createdAt: string;
}

export interface FileItem {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  extractedText?: string;
  createdAt: string;
}

export interface UsageResponse {
  totalTokens: number;
  totalRequests: number;
  byModel: Record<string, number>;
  byType: Record<string, number>;
  recent: Array<{
    id: string;
    model: string;
    tokens: number;
    type: string;
    createdAt: string;
  }>;
}
