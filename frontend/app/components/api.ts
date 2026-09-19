export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public retryAfter = 0,
  ) {
    super(message);
  }
}

async function readResponse(response: Response, fallback: string, retryAfter = 0) {
  const result = await response.json();
  if (!response.ok) {
    throw new RequestError(
      result.error?.message ?? fallback,
      response.status,
      result.error?.code ?? 'INTERNAL_ERROR',
      retryAfter,
    );
  }
  return result;
}

export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  etag?: string,
  signal?: AbortSignal,
): Promise<{data: T; etag: string | null; nextCursor?: string | null}> {
  const options = {cache: 'no-store', credentials: 'same-origin', signal} as const;
  const headers: Record<string, string> = {};
  const isRead = method === 'GET';

  if (!isRead) {
    const csrf = await fetch('/api/v1/auth/csrf', options);
    const result = await readResponse(csrf, '인증 확인에 실패했습니다.');
    headers['X-CSRF-Token'] = result.csrfToken;
    headers['Content-Type'] = 'application/json';
    if (etag) headers['If-Match'] = etag;
  }

  const response = await fetch(`/api/v1/${path}`, {
    ...options,
    method,
    headers,
    ...(isRead ? {} : {body: JSON.stringify(body ?? {})}),
  });
  if (response.status === 204) return {data: undefined as T, etag: null};

  const result = await readResponse(
    response,
    '요청에 실패했습니다.',
    Number(response.headers.get('retry-after') ?? 0),
  );
  return {data: result.data as T, etag: response.headers.get('etag'), nextCursor: result.nextCursor};
}
