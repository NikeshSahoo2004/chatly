import { Document, Schema } from 'mongoose';

export interface IMessageReaction extends Document {
  messageId: Schema.Types.ObjectId;
  userId: Schema.Types.ObjectId;
  reaction: string; // Emoji character string (e.g. "👍")
  createdAt: Date;
  updatedAt: Date;
}
