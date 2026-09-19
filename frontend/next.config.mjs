export default {
  async rewrites() {
    return [{ source: '/docs', destination: '/api-docs.html' }];
  },
};
