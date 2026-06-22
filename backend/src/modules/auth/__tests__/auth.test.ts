import request from 'supertest';
import { app, server } from '../../../server';
import { User } from '../../user/user.model';
import { RefreshToken } from '../refresh-token.model';
import { redisClient } from '../../../database/redis';
import { config } from '../../../config';

// Mock User Model
jest.mock('../../user/user.model', () => {
  const mockUserInstance = {
    id: 'mock_user_id',
    _id: 'mock_user_id',
    name: 'Test User',
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    comparePassword: jest.fn().mockResolvedValue(true),
    toJSON: jest.fn().mockReturnValue({
      id: 'mock_user_id',
      name: 'Test User',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
    }),
  };

  return {
    User: {
      create: jest.fn().mockResolvedValue(mockUserInstance),
      findOne: jest.fn(),
      findById: jest.fn().mockResolvedValue(mockUserInstance),
      findByIdAndUpdate: jest.fn().mockResolvedValue(mockUserInstance),
    },
  };
});

// Mock RefreshToken Model
jest.mock('../refresh-token.model', () => ({
  RefreshToken: {
    create: jest.fn().mockResolvedValue({}),
    findOne: jest.fn(),
    deleteOne: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({}),
  },
}));

// Mock Database Connections to prevent active connection boots
jest.mock('../../../database/index', () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../database/redis', () => ({
  redisClient: {
    isOpen: false, // Set to false to skip Redis socket adapter registration in tests
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

describe('Auth Endpoints Integration Tests', () => {
  beforeAll((done) => {
    if (!server.listening) {
      server.listen(5050, () => done());
    } else {
      done();
    }
  });

  afterAll((done) => {
    server.close(() => done());
  });

  beforeEach(() => {
    jest.clearAllMocks();

    const mockUserInstance = {
      id: 'mock_user_id',
      _id: 'mock_user_id',
      name: 'Test User',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
      comparePassword: jest.fn().mockResolvedValue(true),
      toJSON: jest.fn().mockReturnValue({
        id: 'mock_user_id',
        name: 'Test User',
        username: 'testuser',
        email: 'test@example.com',
        role: 'user',
      }),
    };

    // Reset Redis mocks explicitly to override Jest resetMocks behavior
    (redisClient.get as jest.Mock).mockResolvedValue(null);
    (redisClient.setEx as jest.Mock).mockResolvedValue('OK');

    // Reset User mocks explicitly to override Jest resetMocks behavior
    (User.create as jest.Mock).mockResolvedValue(mockUserInstance);
    (User.findById as jest.Mock).mockResolvedValue(mockUserInstance);
    (User.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockUserInstance);

    // Default User.findOne to return chainable select returning null (no user found)
    (User.findOne as jest.Mock).mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(null),
    }));
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      // User does not exist, findOne returns null (already default)
      const response = await request(app).post('/api/auth/register').send({
        name: 'Test User',
        username: 'testuser',
        email: 'test@example.com',
        password: 'securePassword123',
      });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.username).toBe('testuser');
      expect(User.create).toHaveBeenCalled();
    });

    it('should fail registration on missing fields (Zod validation)', async () => {
      const response = await request(app).post('/api/auth/register').send({
        name: 'Test User',
        username: '',
      });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('Validation failed');
    });

    it('should fail registration if email already exists', async () => {
      // Mock User.findOne to return an existing user document
      (User.findOne as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockResolvedValue({ id: 'existing_user_id' }),
      }));

      const response = await request(app).post('/api/auth/register').send({
        name: 'Test User',
        username: 'testuser',
        email: 'test@example.com',
        password: 'securePassword123',
      });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('already in use');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login user and set authentication cookies', async () => {
      const mockUser = {
        id: 'mock_user_id',
        _id: 'mock_user_id',
        name: 'Test User',
        username: 'testuser',
        email: 'test@example.com',
        role: 'user',
        comparePassword: jest.fn().mockResolvedValue(true),
        toJSON: jest
          .fn()
          .mockReturnValue({ id: 'mock_user_id', username: 'testuser' }),
      };

      // Setup findOne to return a query chain that resolves to mockUser
      (User.findOne as jest.Mock).mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(mockUser),
      }));

      const response = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'securePassword123',
      });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.headers['set-cookie']).toBeDefined();

      // Verify cookies are set
      const setCookieHeader = response.headers['set-cookie'];
      const cookies = Array.isArray(setCookieHeader)
        ? setCookieHeader.join(';')
        : setCookieHeader || '';
      expect(cookies).toContain('accessToken');
      expect(cookies).toContain('refreshToken');
    });

    it('should fail login on invalid credentials', async () => {
      // User not found (default)
      const response = await request(app).post('/api/auth/login').send({
        email: 'notfound@example.com',
        password: 'wrongpassword',
      });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('Invalid credentials');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should rotate token pair successfully', async () => {
      // Mock active token check
      (RefreshToken.findOne as jest.Mock).mockResolvedValue({
        _id: 'token_id',
      });

      // Generate a mock valid refresh token using config credentials
      const jwt = require('jsonwebtoken');
      const mockRefreshToken = jwt.sign(
        { userId: 'mock_user_id' },
        config.jwt.refreshSecret,
        { expiresIn: '7d' }
      );

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refreshToken=${mockRefreshToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('should fail refresh if no token cookie present', async () => {
      const response = await request(app).post('/api/auth/refresh');
      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear cookies and invalidate sessions on logout', async () => {
      const jwt = require('jsonwebtoken');
      const mockAccessToken = jwt.sign(
        {
          userId: 'mock_user_id',
          username: 'testuser',
          email: 'test@example.com',
          role: 'user',
        },
        config.jwt.secret,
        { expiresIn: '15m' }
      );
      const mockRefreshToken = jwt.sign(
        { userId: 'mock_user_id' },
        config.jwt.refreshSecret,
        { expiresIn: '7d' }
      );

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [
          `accessToken=${mockAccessToken}`,
          `refreshToken=${mockRefreshToken}`,
        ]);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');

      // Verify cookies are cleared (max-age=0 or expires in the past)
      const setCookieHeader = response.headers['set-cookie'];
      const cookies = Array.isArray(setCookieHeader)
        ? setCookieHeader.join(';')
        : setCookieHeader || '';
      expect(cookies).toContain('accessToken=;');
      expect(cookies).toContain('refreshToken=;');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return the current user profile when authenticated', async () => {
      const jwt = require('jsonwebtoken');
      const mockAccessToken = jwt.sign(
        {
          userId: 'mock_user_id',
          username: 'testuser',
          email: 'test@example.com',
          role: 'user',
        },
        config.jwt.secret,
        { expiresIn: '15m' }
      );

      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`accessToken=${mockAccessToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.username).toBe('testuser');
    });

    it('should return 401 when no auth token is provided', async () => {
      const response = await request(app).get('/api/auth/me');
      expect(response.status).toBe(401);
    });
  });
});
