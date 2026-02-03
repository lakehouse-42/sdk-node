/**
 * Lakehouse42 SDK - Custom Error Classes
 */

import type { ApiErrorType, ApiErrorResponse } from './types';

/**
 * Base error class for all Lakehouse42 SDK errors
 */
export class LakehouseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LakehouseError';
    Object.setPrototypeOf(this, LakehouseError.prototype);
  }
}

/**
 * Error thrown when the API returns an error response
 */
export class LakehouseApiError extends LakehouseError {
  /** HTTP status code */
  readonly status: number;
  /** Error type from the API */
  readonly type: ApiErrorType;
  /** Error code from the API */
  readonly code: string;
  /** Parameter that caused the error (if applicable) */
  readonly param?: string;
  /** Request ID for debugging */
  readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    type: ApiErrorType,
    code: string,
    param?: string,
    requestId?: string
  ) {
    super(message);
    this.name = 'LakehouseApiError';
    this.status = status;
    this.type = type;
    this.code = code;
    this.param = param;
    this.requestId = requestId;
    Object.setPrototypeOf(this, LakehouseApiError.prototype);
  }

  static fromResponse(response: ApiErrorResponse, status: number): LakehouseApiError {
    return new LakehouseApiError(
      response.error.message,
      status,
      response.error.type,
      response.error.code,
      response.error.param,
      response.meta?.request_id
    );
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends LakehouseApiError {
  constructor(message: string, requestId?: string) {
    super(message, 401, 'authentication_error', 'invalid_api_key', undefined, requestId);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Error thrown when the user lacks permission
 */
export class AuthorizationError extends LakehouseApiError {
  constructor(message: string, requestId?: string) {
    super(message, 403, 'authorization_error', 'insufficient_permissions', undefined, requestId);
    this.name = 'AuthorizationError';
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

/**
 * Error thrown when a resource is not found
 */
export class NotFoundError extends LakehouseApiError {
  constructor(message: string, code: string = 'not_found', requestId?: string) {
    super(message, 404, 'not_found_error', code, undefined, requestId);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Error thrown when the request is invalid
 */
export class ValidationError extends LakehouseApiError {
  constructor(message: string, code: string = 'validation_error', param?: string, requestId?: string) {
    super(message, 400, 'invalid_request_error', code, param, requestId);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error thrown when a resource already exists
 */
export class ConflictError extends LakehouseApiError {
  constructor(message: string, code: string = 'conflict', requestId?: string) {
    super(message, 409, 'conflict_error', code, undefined, requestId);
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Error thrown when a quota is exceeded
 */
export class QuotaExceededError extends LakehouseApiError {
  constructor(message: string, code: string, requestId?: string) {
    super(message, 403, 'quota_exceeded_error', code, undefined, requestId);
    this.name = 'QuotaExceededError';
    Object.setPrototypeOf(this, QuotaExceededError.prototype);
  }
}

/**
 * Error thrown when rate limited
 */
export class RateLimitError extends LakehouseApiError {
  /** Time in seconds until the rate limit resets */
  readonly retryAfter?: number;

  constructor(message: string, retryAfter?: number, requestId?: string) {
    super(message, 429, 'rate_limit_error', 'rate_limit_exceeded', undefined, requestId);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Error thrown when the server encounters an error
 */
export class ServerError extends LakehouseApiError {
  constructor(message: string, code: string = 'server_error', requestId?: string) {
    super(message, 500, 'server_error', code, undefined, requestId);
    this.name = 'ServerError';
    Object.setPrototypeOf(this, ServerError.prototype);
  }
}

/**
 * Error thrown when a request times out
 */
export class TimeoutError extends LakehouseError {
  readonly timeout: number;

  constructor(timeout: number) {
    super(`Request timed out after ${timeout}ms`);
    this.name = 'TimeoutError';
    this.timeout = timeout;
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Error thrown when a network error occurs
 */
export class NetworkError extends LakehouseError {
  override readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Error thrown when streaming fails
 */
export class StreamError extends LakehouseError {
  constructor(message: string) {
    super(message);
    this.name = 'StreamError';
    Object.setPrototypeOf(this, StreamError.prototype);
  }
}

/**
 * Creates the appropriate error instance based on API response
 */
export function createApiError(
  response: ApiErrorResponse,
  status: number,
  retryAfter?: number
): LakehouseApiError {
  const { type, message, code } = response.error;
  const requestId = response.meta?.request_id;

  switch (type) {
    case 'authentication_error':
      return new AuthenticationError(message, requestId);

    case 'authorization_error':
      return new AuthorizationError(message, requestId);

    case 'not_found_error':
      return new NotFoundError(message, code, requestId);

    case 'invalid_request_error':
      return new ValidationError(message, code, response.error.param, requestId);

    case 'conflict_error':
      return new ConflictError(message, code, requestId);

    case 'quota_exceeded_error':
      return new QuotaExceededError(message, code, requestId);

    case 'rate_limit_error':
      return new RateLimitError(message, retryAfter, requestId);

    case 'server_error':
      return new ServerError(message, code, requestId);

    default:
      return LakehouseApiError.fromResponse(response, status);
  }
}

/**
 * Type guard to check if an error is a Lakehouse42 error
 */
export function isLakehouseError(error: unknown): error is LakehouseError {
  return error instanceof LakehouseError;
}

/**
 * Type guard to check if an error is an API error
 */
export function isApiError(error: unknown): error is LakehouseApiError {
  return error instanceof LakehouseApiError;
}

/**
 * Type guard to check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RateLimitError) {
    return true;
  }
  if (error instanceof ServerError) {
    return true;
  }
  if (error instanceof NetworkError) {
    return true;
  }
  if (error instanceof TimeoutError) {
    return true;
  }
  return false;
}
