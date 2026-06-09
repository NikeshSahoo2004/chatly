import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { app, server } from '../../../server';
import { User } from '../../user/user.model';
import { Conversation } from '../conversation.model';
import { redisClient } from '../../../database/redis';
import { config } from '../../../config';

// Mock models and connections
jest.mock('../../user/user.model', () => ({
  User: {
    find: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock('../conversation.model', () => ({
  Conversation: {
    findById: jest.fn(),
    create: jest.fn(),
    findByIdAndDelete: jest.fn(),
  },
}));

jest.mock('../../../database/index', () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../database/redis', () => ({
  redisClient: {
    isOpen: false,
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

describe('Group Chat Endpoints Integration Tests', () => {
  let adminToken: string;
  let memberToken: string;
  let nonMemberToken: string;
  const adminId = '60c72b2f9b1d8e25a8f4c201';
  const memberId = '60c72b2f9b1d8e25a8f4c202';
  const nonMemberId = '60c72b2f9b1d8e25a8f4c203';
  const groupConvId = '60c72b2f9b1d8e25a8f4c250';

  const mockQuery = (resolveValue: any) => {
    const query: any = {
      populate: jest.fn().mockImplementation(() => query),
      sort: jest.fn().mockImplementation(() => query),
      limit: jest.fn().mockImplementation(() => query),
      then: (resolve: any) => resolve(resolveValue),
    };
    return query;
  };

  beforeAll((done) => {
    adminToken = jwt.sign(
      { userId: adminId, username: 'admin', email: 'admin@example.com', role: 'user' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
    memberToken = jwt.sign(
      { userId: memberId, username: 'member', email: 'member@example.com', role: 'user' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
    nonMemberToken = jwt.sign(
      { userId: nonMemberId, username: 'nonmember', email: 'nonmember@example.com', role: 'user' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

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
    (redisClient.get as jest.Mock).mockResolvedValue(null);
  });

  describe('POST /api/conversations/group', () => {
    it('should successfully create a new group conversation with correct configurations', async () => {
      // Mock validation that participants exist
      (User.find as jest.Mock).mockResolvedValue([
        { _id: adminId },
        { _id: memberId },
      ]);

      const groupObject = {
        _id: groupConvId,
        name: 'Design Team',
        isGroup: true,
        participants: [adminId, memberId],
        admins: [adminId],
        owner: adminId,
        avatar: '',
      };

      (Conversation.create as jest.Mock).mockResolvedValue(groupObject);
      (Conversation.findById as jest.Mock).mockImplementation(() => mockQuery(groupObject));

      const res = await request(app)
        .post('/api/conversations/group')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Design Team',
          participants: [memberId],
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.conversation.name).toBe('Design Team');
      expect(res.body.data.conversation.owner).toBe(adminId);
      expect(res.body.data.conversation.isGroup).toBe(true);
      expect(Conversation.create).toHaveBeenCalled();
    });

    it('should fail creation if validation schema is not satisfied', async () => {
      const res = await request(app)
        .post('/api/conversations/group')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Sh', // too short group name
          participants: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Validation failed');
    });
  });

  describe('POST /api/conversations/:id/participants', () => {
    it('should add members successfully when requested by a group admin', async () => {
      const groupConv = {
        _id: groupConvId,
        name: 'Design Team',
        isGroup: true,
        participants: [adminId, memberId],
        admins: [adminId],
        owner: adminId,
        save: jest.fn().mockResolvedValue(true),
      };

      (Conversation.findById as jest.Mock).mockResolvedValue(groupConv);
      (User.find as jest.Mock).mockResolvedValue([{ _id: nonMemberId }]);

      const updatedGroup = {
        ...groupConv,
        participants: [adminId, memberId, nonMemberId],
      };
      (Conversation.findById as jest.Mock).mockImplementation((id) => {
        if (id === groupConvId) {
          // first search returns groupConv for editing, second for populate response
          return mockQuery(updatedGroup);
        }
        return mockQuery(null);
      });

      // reset findById mock to return groupConv for edit, then updatedGroup for populated query
      let findCount = 0;
      (Conversation.findById as jest.Mock).mockImplementation(() => {
        findCount++;
        if (findCount === 1) return groupConv as any;
        return mockQuery(updatedGroup);
      });

      const res = await request(app)
        .post(`/api/conversations/${groupConvId}/participants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ participantIds: [nonMemberId] });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(groupConv.save).toHaveBeenCalled();
    });

    it('should deny adding members when requested by a non-admin participant', async () => {
      const groupConv = {
        _id: groupConvId,
        name: 'Design Team',
        isGroup: true,
        participants: [adminId, memberId],
        admins: [adminId], // memberId is not admin
        owner: adminId,
      };

      (Conversation.findById as jest.Mock).mockResolvedValue(groupConv);

      const res = await request(app)
        .post(`/api/conversations/${groupConvId}/participants`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ participantIds: [nonMemberId] });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Only group admins can add participants');
    });
  });

  describe('DELETE /api/conversations/:id/participants', () => {
    it('should successfully remove members when requested by an admin', async () => {
      const groupConv = {
        _id: groupConvId,
        name: 'Design Team',
        isGroup: true,
        participants: [adminId, memberId],
        admins: [adminId],
        owner: adminId,
        save: jest.fn().mockResolvedValue(true),
      };

      let findCount = 0;
      (Conversation.findById as jest.Mock).mockImplementation(() => {
        findCount++;
        if (findCount === 1) return groupConv as any;
        return mockQuery({ ...groupConv, participants: [adminId] });
      });

      const res = await request(app)
        .delete(`/api/conversations/${groupConvId}/participants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ participantIds: [memberId] });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(groupConv.save).toHaveBeenCalled();
    });

    it('should throw an error if attempting to remove the group owner', async () => {
      const groupConv = {
        _id: groupConvId,
        name: 'Design Team',
        isGroup: true,
        participants: [adminId, memberId],
        admins: [adminId],
        owner: adminId,
      };

      (Conversation.findById as jest.Mock).mockResolvedValue(groupConv);

      const res = await request(app)
        .delete(`/api/conversations/${groupConvId}/participants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ participantIds: [adminId] });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Group owner cannot be removed');
    });
  });

  describe('PATCH /api/conversations/:id/admins', () => {
    it('should successfully add new admins when requested by an existing admin', async () => {
      const groupConv = {
        _id: groupConvId,
        isGroup: true,
        participants: [adminId, memberId],
        admins: [adminId],
        owner: adminId,
        save: jest.fn().mockResolvedValue(true),
      };

      let findCount = 0;
      (Conversation.findById as jest.Mock).mockImplementation(() => {
        findCount++;
        if (findCount === 1) return groupConv as any;
        return mockQuery({ ...groupConv, admins: [adminId, memberId] });
      });

      const res = await request(app)
        .patch(`/api/conversations/${groupConvId}/admins`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ adminIds: [memberId], action: 'add' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(groupConv.save).toHaveBeenCalled();
    });
  });

  describe('POST /api/conversations/:id/leave', () => {
    it('should successfully leave the group and transfer owner role if the owner leaves', async () => {
      const groupConv = {
        _id: groupConvId,
        isGroup: true,
        participants: [adminId, memberId],
        admins: [adminId],
        owner: adminId,
        save: jest.fn().mockResolvedValue(true),
      };

      let findCount = 0;
      (Conversation.findById as jest.Mock).mockImplementation(() => {
        findCount++;
        if (findCount === 1) return groupConv as any;
        return mockQuery({ ...groupConv, participants: [memberId], admins: [memberId], owner: memberId });
      });

      const res = await request(app)
        .post(`/api/conversations/${groupConvId}/leave`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.status).toBe('left');
      expect(groupConv.save).toHaveBeenCalled();
    });
  });
});
