// utils/httpClient.ts
/**
 * Generic HTTP Client
 * 
 * Centralized fetch utility with consistent error handling, logging, and rate limit detection.
 * All HTTP requests in the application should go through this module.
 */

import { log, ERR, LOG, WARN } from './log.js';

/**
 * Generic HTTP error class for all HTTP-related errors
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    public message: string,
    public url: string,
    public details?: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Options for HTTP requests
 */
export interface HttpRequestOptions {
  /** Custom headers to include in the request */
  headers?: Record<string, string>;
  /** Request method (defaults to GET) */
  method?: string;
  /** Request body */
  body?: BodyInit;
  /** Context for logging (e.g., 'CoinGecko API', 'Vercel Blob') */
  context?: string;
}

/**
 * Fetches a URL and returns the response as JSON
 * 
 * @param url - The URL to fetch
 * @param options - Optional request configuration
 * @returns Parsed JSON data
 * @throws HttpError if the request fails or response is not OK
 */
export async function fetchJson<T = any>(
  url: string,
  options: HttpRequestOptions = {}
): Promise<T> {
  const response = await fetchHttp(url, options);
  try {
    const data = await response.json();
    return data as T;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Failed to parse JSON response from ${url}: ${errorMessage}`, ERR);
    throw new HttpError(
      response.status,
      `Failed to parse JSON response: ${errorMessage}`,
      url,
      errorMessage
    );
  }
}

/**
 * Fetches a URL and returns the response as text
 * 
 * @param url - The URL to fetch
 * @param options - Optional request configuration
 * @returns Response text
 * @throws HttpError if the request fails or response is not OK
 */
export async function fetchText(
  url: string,
  options: HttpRequestOptions = {}
): Promise<string> {
  const response = await fetchHttp(url, options);
  try {
    return await response.text();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Failed to read text response from ${url}: ${errorMessage}`, ERR);
    throw new HttpError(
      response.status,
      `Failed to read text response: ${errorMessage}`,
      url,
      errorMessage
    );
  }
}

/**
 * Fetches a URL and returns the response as a Blob
 * 
 * @param url - The URL to fetch
 * @param options - Optional request configuration
 * @returns Response blob
 * @throws HttpError if the request fails or response is not OK
 */
export async function fetchBlob(
  url: string,
  options: HttpRequestOptions = {}
): Promise<Blob> {
  const response = await fetchHttp(url, options);
  try {
    return await response.blob();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Failed to read blob response from ${url}: ${errorMessage}`, ERR);
    throw new HttpError(
      response.status,
      `Failed to read blob response: ${errorMessage}`,
      url,
      errorMessage
    );
  }
}

/**
 * Core HTTP fetch function with error handling and rate limit detection
 * 
 * @param url - The URL to fetch
 * @param options - Optional request configuration
 * @returns Response object
 * @throws HttpError if the request fails or response is not OK
 */
async function fetchHttp(
  url: string,
  options: HttpRequestOptions = {}
): Promise<Response> {
  const context = options.context || 'HTTP';
  const method = options.method || 'GET';
  
  // Build headers
  const headers: HeadersInit = {
    'Accept': 'application/json',
    ...options.headers,
  };

  // Log request (mask sensitive data in URL)
  const urlForLogging = maskSensitiveUrl(url);
  log(`[${context}] ${method} ${urlForLogging}`, LOG);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: options.body,
    });

    // Log response status
    log(`[${context}] Response: ${response.status} ${response.statusText}`, LOG);

    // Check for rate limiting
    checkRateLimits(response, context);

    // Check if response is OK
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      const errorPreview = errorText.substring(0, 200);
      log(`[${context}] ❌ Error Response: ${errorPreview}`, ERR);
      
      throw new HttpError(
        response.status,
        `${context} responded with status ${response.status}: ${response.statusText}`,
        url,
        errorText
      );
    }

    return response;
  } catch (error) {
    // Re-throw HttpError as-is
    if (error instanceof HttpError) {
      throw error;
    }

    // Handle network errors and other exceptions
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`[${context}] Network/Request Error: ${errorMessage}`, ERR);
    throw new HttpError(
      0,
      `Failed to fetch from ${context}: ${errorMessage}`,
      url,
      errorMessage
    );
  }
}

/**
 * Checks response headers for rate limit information and logs warnings
 */
function checkRateLimits(response: Response, context: string): void {
  // Check common rate limit headers
  const rateLimitRemaining = response.headers.get('x-ratelimit-remaining') ||
                             response.headers.get('ratelimit-remaining') ||
                             response.headers.get('x-ratelimit-remaining-requests');
  
  const rateLimitReset = response.headers.get('x-ratelimit-reset') ||
                         response.headers.get('ratelimit-reset') ||
                         response.headers.get('x-ratelimit-reset-seconds');

  if (rateLimitRemaining !== null) {
    const remaining = parseInt(rateLimitRemaining, 10);
    log(`[${context}] Rate limit remaining: ${remaining}`, LOG);
    
    // Warn if rate limit is getting low
    if (remaining < 10) {
      log(`[${context}] ⚠️ Rate limit is low (${remaining} remaining)`, WARN);
    }
  }

  if (rateLimitReset !== null) {
    const resetTime = parseInt(rateLimitReset, 10);
    // Handle both Unix timestamp (seconds) and milliseconds
    const resetDate = resetTime < 1e12 
      ? new Date(resetTime * 1000) 
      : new Date(resetTime);
    log(`[${context}] Rate limit resets at: ${resetDate.toISOString()}`, LOG);
  }

  // Check for rate limit status codes
  if (response.status === 429) {
    log(`[${context}] ⚠️ Rate limit exceeded (429)`, WARN);
  }
}

/**
 * Masks sensitive information in URLs (API keys, tokens, etc.)
 */
function maskSensitiveUrl(url: string): string {
  // Mask common API key parameter names
  const sensitiveParams = [
    'x_cg_demo_api_key',
    'api_key',
    'apikey',
    'token',
    'access_token',
    'authorization',
  ];

  let maskedUrl = url;
  for (const param of sensitiveParams) {
    const regex = new RegExp(`([?&])${param}=[^&]+`, 'gi');
    maskedUrl = maskedUrl.replace(regex, `$1${param}=***MASKED***`);
  }

  return maskedUrl;
}

