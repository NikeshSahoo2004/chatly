import { z } from 'zod';

// MongoDB ObjectId validation regex
const objectIdSchema = z
  .string({ required_error: 'ID is required' })
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

export const createConversationSchema = z.object({
  body: z.object({
    recipientId: objectIdSchema,
  }),
});

export const sendMessageSchema = z.object({
  body: z.object({
    conversationId: objectIdSchema,
    content: z
      .string({ required_error: 'Content is required' })
      .min(1, 'Message content cannot be empty'),
  }),
});

export const getMessagesQuerySchema = z.object({
  params: z.object({
    conversationId: objectIdSchema,
  }),
  query: z.object({
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 20))
      .refine(
        (val) => val > 0 && val <= 100,
        'Limit must be between 1 and 100'
      ),
    cursor: z
      .string()
      .datetime({ message: 'Cursor must be a valid ISO-8601 date string' })
      .optional(),
  }),
});
export const createGroupSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Group name is required' })
      .min(3, 'Group name must be at least 3 characters')
      .max(50, 'Group name cannot exceed 50 characters'),
    participants: z
      .array(objectIdSchema)
      .min(1, 'At least one group participant is required'),
    avatar: z.string().optional(),
  }),
});

export const updateGroupParticipantsSchema = z.object({
  body: z.object({
    participantIds: z
      .array(objectIdSchema)
      .min(1, 'At least one participant ID is required'),
  }),
});

export const updateGroupAdminsSchema = z.object({
  body: z.object({
    adminIds: z
      .array(objectIdSchema)
      .min(1, 'At least one admin ID is required'),
    action: z.enum(['add', 'remove'], {
      required_error: 'Action is required (add or remove)',
    }),
  }),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupParticipantsInput = z.infer<
  typeof updateGroupParticipantsSchema
>;
export type UpdateGroupAdminsInput = z.infer<typeof updateGroupAdminsSchema>;
