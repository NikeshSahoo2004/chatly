import { Document, Schema } from 'mongoose';

export interface IDeliveredReceipt {
  userId: Schema.Types.ObjectId;
  at: Date;
}

export interface ISeenReceipt {
  userId: Schema.Types.ObjectId;
  at: Date;
}

export interface IMessage extends Document {
  conversationId: Schema.Types.ObjectId;
  senderId: Schema.Types.ObjectId;
  content: string; // Encrypted ciphertext
  iv: string;      // Initialization Vector (hex)
  authTag: string; // Authentication Tag (hex)
  isDeleted: boolean;
  isPinned: boolean;
  deliveredTo: IDeliveredReceipt[];
  seenBy: ISeenReceipt[];
  replyTo?: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
