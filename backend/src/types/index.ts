export interface AuthPayload {
  userId: string;
  email?: string | null;
  name?: string | null;
  avatar?: string | null;
}

export interface ApiError {
  error: string;
  details?: any;
}
