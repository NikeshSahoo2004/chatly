import { Router } from 'express';
import { ConversationController } from './conversation.controller';
import { MessageController } from './message.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { upload } from '../../middleware/upload.middleware';
import { User } from '../user/user.model';
import {
  createConversationSchema,
  sendMessageSchema,
  getMessagesQuerySchema,
  createGroupSchema,
  updateGroupParticipantsSchema,
  updateGroupAdminsSchema,
} from './chat.validator';

const router = Router();
const conversationController = new ConversationController();
const messageController = new MessageController();

// All chat routes require authentication
router.use(authenticate);

// User lookup route for starting new chats
router.get('/users/search', async (req, res, next) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.status(200).json({ status: 'success', data: { users: [] } });
      return;
    }
    const users = await User.find({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
      ],
      _id: { $ne: req.user?.userId },
    }).select('name username email avatar isOnline lastSeen').limit(10);

    res.status(200).json({ status: 'success', data: { users } });
  } catch (err) {
    next(err);
  }
});

// Conversations routes
router.post('/conversations', validate(createConversationSchema), conversationController.createConversation);
router.get('/conversations', conversationController.getConversations);
router.post('/conversations/group', validate(createGroupSchema), conversationController.createGroupConversation);
router.get('/conversations/:id', conversationController.getConversationById);
router.post('/conversations/:id/participants', validate(updateGroupParticipantsSchema), conversationController.addGroupParticipants);
router.delete('/conversations/:id/participants', validate(updateGroupParticipantsSchema), conversationController.removeGroupParticipants);
router.patch('/conversations/:id/admins', validate(updateGroupAdminsSchema), conversationController.updateGroupAdmins);
router.post('/conversations/:id/leave', conversationController.leaveGroupConversation);

// Messages routes
router.post('/messages', validate(sendMessageSchema), messageController.sendMessage);
router.get('/messages/:conversationId', validate(getMessagesQuerySchema), messageController.getMessages);
router.get('/messages/:conversationId/search', messageController.searchMessages);
router.post('/chat/upload', upload.single('file'), messageController.uploadFile);
router.delete('/messages/:id', messageController.deleteMessage);

export default router;
