import { Document, Schema } from 'mongoose';

export interface IConversation extends Document {
  name?: string;
  isGroup: boolean;
  participants: Schema.Types.ObjectId[];
  admins: Schema.Types.ObjectId[];
  owner?: Schema.Types.ObjectId;
  avatar?: string;
  lastMessage?: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
