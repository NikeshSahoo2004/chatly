import { Schema, model } from 'mongoose';
import { IMessage } from './message.interface';

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'Conversation ID is required'],
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender ID is required'],
      index: true,
    },
    content: {
      type: String,
      required: [true, 'Encrypted content is required'],
    },
    iv: {
      type: String,
      required: [true, 'IV is required'],
    },
    authTag: {
      type: String,
      required: [true, 'Auth tag is required'],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    deletedFor: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    deliveredTo: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        at: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    seenBy: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        at: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
  },
  {
    timestamps: true,
  }
);

// Optimization index: Fetch message history page sorted by date
MessageSchema.index({ conversationId: 1, createdAt: -1 });

// Optimization index: Query pinned messages inside a conversation
MessageSchema.index({ conversationId: 1, isPinned: 1 });

export const Message = model<IMessage>('Message', MessageSchema);
