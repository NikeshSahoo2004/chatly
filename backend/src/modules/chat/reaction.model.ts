import { Schema, model } from 'mongoose';
import { IMessageReaction } from './reaction.interface';

const MessageReactionSchema = new Schema<IMessageReaction>(
  {
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      required: [true, 'Message ID is required'],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    reaction: {
      type: String,
      required: [true, 'Reaction emoji is required'],
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Unique index: Ensures a user can place only a single active reaction emoji on any single message
MessageReactionSchema.index({ messageId: 1, userId: 1 }, { unique: true });

export const MessageReaction = model<IMessageReaction>('MessageReaction', MessageReactionSchema);
