/**
 * Type definitions for the LLM chat application.
 */

export interface Env {
  /**
   * Binding for the Workers AI API.
   */
  AI: Ai;

  /**
   * Binding for static assets.
   */
  ASSETS: Fetcher;
}

/**
 * Represents a chat message with role and content.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp?: number; // Optional timestamp for client-side sorting
}

/**
 * Extended error interface for better error handling
 */
export interface ChatError {
  error: string;
  message: string;
  code?: number;
  retryAfter?: number;
}

/**
 * Response format for streaming chunks
 */
export interface StreamResponse {
  response: string;
  type?: "chunk" | "complete";
  timestamp?: number;
}
