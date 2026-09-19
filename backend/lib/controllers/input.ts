import 'server-only';
import {ApiError, requireThat} from '../errors';

const maxBodyBytes = 16384;

export function object(value: unknown, keys: string[]): Record<string, any> {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), 400, 'INVALID_INPUT');
  const input = value as Record<string, any>;
  requireThat(Object.keys(input).every(key => keys.includes(key)), 400, 'INVALID_INPUT');
  return input;
}

export function uuid(value: unknown) {
  requireThat(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value), 400, 'INVALID_INPUT');
  return value;
}

export function text(value: unknown, max: number, optional = false): string {
  requireThat(typeof value === 'string' && value.length <= max && (optional || value.trim().length > 0), 400, 'INVALID_INPUT');
  return value.trim();
}

export function integer(value: unknown, min: number, max: number) {
  requireThat(typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max, 400, 'INVALID_INPUT');
  return value;
}

export function boolean(value: unknown) {
  requireThat(typeof value === 'boolean', 400, 'INVALID_INPUT');
  return value;
}

export function slots(value: unknown) {
  requireThat(Array.isArray(value) && value.length <= 693, 400, 'INVALID_INPUT');
  return [...new Set(value.map(slot => integer(slot, 101, 799)))].sort((a, b) => a - b);
}

export function date(value: unknown) {
  requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 400, 'INVALID_INPUT');
  return value;
}

export function choice(value: unknown, allowed: string[]) {
  requireThat(typeof value === 'string' && allowed.includes(value), 400, 'INVALID_INPUT');
  return value;
}

export async function body(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > maxBodyBytes) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE');
  }
  if (request.body === null) return {};

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBodyBytes) {
      await reader.cancel();
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE');
    }
    chunks.push(value);
  }
  if (!size) return {};

  requireThat(request.headers.get('content-type')?.split(';')[0].trim() === 'application/json', 400, 'INVALID_INPUT');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'INVALID_INPUT');
  }
}
