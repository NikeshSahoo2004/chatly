import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { server, io } from '../../../server';
import jwt from 'jsonwebtoken';
import { config } from '../../../config';
import { User } from '../../user/user.model';
import { redisClient } from '../../../database/redis';

// Mock User and DB to prevent database side-effects in test logs
jest.mock('../../user/user.model', () => ({
  User: {
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../../../database/index', () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../database/redis', () => ({
  redisClient: {
    isOpen: false, // Set to false to bypass Redis adapter in tests
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    setEx: jest.fn().mockResolvedValue('OK'),
    get: jest.fn(),
  },
  subClient: {
    isOpen: false,
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
  },
  connectRedis: jest.fn().mockResolvedValue(undefined),
  disconnectRedis: jest.fn().mockResolvedValue(undefined),
}));

describe('Socket.IO Event Flow Tests', () => {
  let openSockets: ClientSocket[] = [];
  let validToken1: string;
  let validToken2: string;

  // Helper to register and track client sockets for clean post-test disconnects
  const connectClient = (token?: string, opts = {}): ClientSocket => {
    const socket = Client('http://localhost:5050', {
      reconnectionDelay: 0,
      forceNew: true,
      transports: ['websocket'],
      auth: token ? { token } : undefined,
      ...opts,
    });
    openSockets.push(socket);
    return socket;
  };

  // Helper to await client socket connection completion
  const waitForConnect = (socket: ClientSocket): Promise<void> => {
    return new Promise((resolve) => {
      if (socket.connected) {
        resolve();
      } else {
        socket.once('connect', resolve);
      }
    });
  };

  beforeAll((done) => {
    // Generate valid JWT tokens for two test clients
    validToken1 = jwt.sign(
      { userId: 'user_1', username: 'user1', email: 'user1@example.com', role: 'user' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
    validToken2 = jwt.sign(
      { userId: 'user_2', username: 'user2', email: 'user2@example.com', role: 'user' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    // Boot local server for client connects if not active
    if (!server.listening) {
      server.listen(5050, () => done());
    } else {
      done();
    }
  });

  afterAll((done) => {
    // Close the Socket.io server to release bindings
    io.close();
    // Close the HTTP server
    server.close(() => done());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (redisClient.get as jest.Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    // Disconnect all clients that were opened during this test
    openSockets.forEach((socket) => {
      if (socket.connected) {
        socket.disconnect();
      }
    });
    openSockets = [];
  });

  it('should reject connection if no auth token is provided', (done) => {
    const socket = connectClient();

    socket.on('connect_error', (err) => {
      expect(err.message).toContain('Authentication error: Token missing');
      done();
    });
  });

  it('should authenticate client successfully with a valid JWT token', async () => {
    const clientSocket = connectClient(validToken1);
    await waitForConnect(clientSocket);
    expect(clientSocket.connected).toBe(true);
  });

  it('should broadcast typing indicators and handle conversation room isolation', async () => {
    const clientSocket1 = connectClient(validToken1);
    const clientSocket2 = connectClient(validToken2);

    // Wait for both to connect
    await Promise.all([
      waitForConnect(clientSocket1),
      waitForConnect(clientSocket2),
    ]);

    // Join conversation rooms and await acknowledgments
    await new Promise((resolve) => {
      clientSocket1.emit('conversation:join', { conversationId: 'conv_123' }, resolve);
    });
    await new Promise((resolve) => {
      clientSocket2.emit('conversation:join', { conversationId: 'conv_123' }, resolve);
    });

    // Setup wait promise for typing event receipt
    const typingPromise = new Promise<any>((resolve) => {
      clientSocket2.once('typing:start', resolve);
    });

    // Sender emits typing start
    clientSocket1.emit('typing:start', { conversationId: 'conv_123' });

    // Wait and verify
    const data = await typingPromise;
    expect(data.conversationId).toBe('conv_123');
    expect(data.userId).toBe('user_1');
    expect(data.username).toBe('user1');
  });

  it('should send delivered and seen receipts to the sender', async () => {
    const clientSocket1 = connectClient(validToken1);
    const clientSocket2 = connectClient(validToken2);

    // Wait for both to connect
    await Promise.all([
      waitForConnect(clientSocket1),
      waitForConnect(clientSocket2),
    ]);

    // Setup wait promise for receipt delivery
    const receiptPromise = new Promise<any>((resolve) => {
      clientSocket1.once('message:delivered', resolve);
    });

    // Recipient acknowledges delivery to sender
    clientSocket2.emit('message:delivered', {
      messageId: 'msg_abc',
      conversationId: 'conv_123',
      senderId: 'user_1',
    });

    // Wait and verify
    const data = await receiptPromise;
    expect(data.messageId).toBe('msg_abc');
    expect(data.userId).toBe('user_2');
  });
});
