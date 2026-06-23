import { Response } from 'express';
import { AppError } from './app-error';

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SuccessResponse {
  success: true;
  data: unknown;
}

interface PaginatedResponse {
  success: true;
  data: unknown[];
  pagination: PaginationInfo;
}

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message: string }>;
  };
}

/**
 * Send a standard success response.
 */
export function sendSuccess(res: Response, data: unknown, statusCode: number = 200): void {
  const response: SuccessResponse = {
    success: true,
    data,
  };
  res.status(statusCode).json(response);
}

/**
 * Send a paginated success response.
 */
export function sendPaginated(
  res: Response,
  data: unknown[],
  pagination: PaginationInfo,
  statusCode: number = 200
): void {
  const response: PaginatedResponse = {
    success: true,
    data,
    pagination,
  };
  res.status(statusCode).json(response);
}

/**
 * Send a standard error response.
 */
export function sendError(res: Response, error: AppError | Error): void {
  if (error instanceof AppError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details.length > 0 ? { details: error.details } : {}),
      },
    };
    res.status(error.statusCode).json(response);
  } else {
    // Unknown error — don't expose internals
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
    res.status(500).json(response);
  }
}
