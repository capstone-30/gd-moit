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
        responses: { default: { description: 'API 응답' } },
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
