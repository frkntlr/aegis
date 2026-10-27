/**
 * @file auth-challenge.ts
 * Structured error and context types for NotebookLM Tri-State Interactive Auth Resolution.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

export type AuthResolutionAction = 'REAUTH' | 'OFFLINE_FALLBACK' | 'ABORT';

export interface AuthChallengeContext {
  operation: string;
  notebookId?: string;
  statusCode?: number;
  errorDetails: string;
  hasSid?: boolean;
  hasPsidts?: boolean;
}

export type AuthChallengeHandler = (
  ctx: AuthChallengeContext
) => Promise<AuthResolutionAction>;

export class NotebookLmAuthError extends Error {
  public readonly code = 'AUTH_REQUIRED_INTERACTIVE';
  public readonly context: AuthChallengeContext;

  constructor(message: string, context: AuthChallengeContext) {
    super(message);
    this.name = 'NotebookLmAuthError';
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public isInteractiveRequired(): boolean {
    return this.code === 'AUTH_REQUIRED_INTERACTIVE';
  }

  public static isAuthError(err: unknown): err is NotebookLmAuthError {
    return (
      err instanceof Error &&
      'code' in err &&
      (err as { code: unknown }).code === 'AUTH_REQUIRED_INTERACTIVE'
    );
  }
}
