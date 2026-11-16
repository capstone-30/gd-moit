import { routes } from '../../../backend/adapters/http/api';

export function GET() {
  const paths = Object.fromEntries(routes.map(([pattern, methods, , options]) => {
    const path = '/' + pattern.replace(/:(\w+)/g, '{$1}');
    const parameters = [...pattern.matchAll(/:(\w+)/g)].map(([, name]) => ({
      name, in: 'path', required: true, schema: { type: 'string' },
    }));
    const operations = Object.fromEntries(methods.split(' ').map(method => {
      const query = method === 'GET' && options?.paginated
        ? [...(options.filters ?? []), 'cursor', 'limit']
        : [];
      const headers = method === 'GET' ? [] : [{
        name: 'X-CSRF-Token', in: 'header', required: true, schema: { type: 'string' },
      }];
      return [method.toLowerCase(), {
        security: options?.public ? [] : [{ session: [] }],
        parameters: [
          ...parameters, ...headers,
          ...query.map(name => ({ name, in: 'query', schema: { type: 'string' } })),
        ],
        ...(method !== 'GET' && method !== 'DELETE' && {
          requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        }),
        responses: { default: {
          description: pattern==='auth/sessions'?'401: OTP_INVALID(오입력), OTP_EXPIRED(만료), OTP_DISCARDED(폐기)':pattern==='hosted-projects/:projectId/meetings'?'입력 오류 시 row는 요청 모임 순서(1부터)':'API 응답',
          content: { 'application/json': { schema: { type:'object', properties:{ error:{type:'object',required:['code','message','requestId'],properties:{code:{type:'string'},message:{type:'string'},requestId:{type:'string'},row:{type:'integer',minimum:1,maximum:20}}} } } } },
        } },
      }];
    }));
    return [path, operations];
  }));
  return Response.json({
    openapi: '3.1.0', info: { title: '모잇 API', version: '1' },
    servers: [{ url: '/api/v1' }],
    components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'moit_session' } } },
    paths,
  });
}
