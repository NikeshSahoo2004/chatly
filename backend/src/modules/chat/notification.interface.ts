import { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  recipientId: Schema.Types.ObjectId;
  senderId?: Schema.Types.ObjectId;
  type: 'message' | 'mention' | 'group_invite' | 'group_update';
  conversationId?: Schema.Types.ObjectId;
  messageId?: Schema.Types.ObjectId;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}
