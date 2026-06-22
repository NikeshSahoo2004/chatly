import { Schema, model } from 'mongoose';
import { IConversation } from './conversation.interface';

const ConversationSchema = new Schema<IConversation>(
  {
    name: {
      type: String,
      trim: true,
    },
    isGroup: {
      type: Boolean,
      default: false,
    },
    participants: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      validate: {
        validator: (v: any) => Array.isArray(v) && v.length > 0,
        message: 'A conversation must have at least one participant',
      },
      required: [true, 'Participants list is required'],
    },
    admins: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    avatar: {
      type: String,
      default: '',
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
  },
  {
    timestamps: true,
  }
);

// Optimization index: retrieve conversations involving a user, sorted by recent updates
ConversationSchema.index({ participants: 1, updatedAt: -1 });

export const Conversation = model<IConversation>(
  'Conversation',
  ConversationSchema
);
