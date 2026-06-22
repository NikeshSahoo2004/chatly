import request from 'supertest';
import { app, server } from '../server';

// Mock Database Connections to prevent active connection boots
jest.mock('../database/index', () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../database/redis', () => ({
  redisClient: {
    isOpen: false,
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    setEx: jest.fn(),
    get: jest.fn(),
  },
  subClient: {
    isOpen: false,
  },
  connectRedis: jest.fn().mockResolvedValue(undefined),
  disconnectRedis: jest.fn().mockResolvedValue(undefined),
}));

describe('Route Listing API Integration Tests', () => {
  beforeAll((done) => {
    if (!server.listening) {
      server.listen(5051, () => done());
    } else {
      done();
    }
  });

  afterAll((done) => {
    server.close(() => done());
  });

  describe('GET /api/routes', () => {
    it('should list all registered routes successfully', async () => {
      const response = await request(app).get('/api/routes');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.results).toBeGreaterThan(0);
      expect(Array.isArray(response.body.data.routes)).toBe(true);

      // Verify it contains some of our core expected routes
      const routesList: { method: string; path: string }[] =
        response.body.data.routes;

      const hasMeRoute = routesList.some(
        (r) => r.path === '/api/auth/me' && r.method === 'GET'
      );
      const hasRegisterRoute = routesList.some(
        (r) => r.path === '/api/auth/register' && r.method === 'POST'
      );
      const hasRoutesRoute = routesList.some(
        (r) => r.path === '/api/routes' && r.method === 'GET'
      );

      expect(hasMeRoute).toBe(true);
      expect(hasRegisterRoute).toBe(true);
      expect(hasRoutesRoute).toBe(true);
    });
  });
});
