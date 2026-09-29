import { z } from 'zod';

export const communityId = z.string().length(40).regex(/^[a-f0-9]{40}$/, 'Invalid community link.');
const context = {
  country: z.string().trim().max(80).default(''),
  language: z.string().trim().max(80).default(''),
};
const target = { postId: communityId, replyId: communityId.nullable().default(null) };

export const communityAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), attemptId: z.string().uuid(), kind: z.enum(['memory', 'weekly']), title: z.string().trim().min(10).max(180), body: z.string().trim().max(3000), ...context }).strict(),
  z.object({ action: z.literal('reply'), attemptId: z.string().uuid(), postId: communityId, body: z.string().trim().min(2).max(3000), parentReplyId: communityId.nullable().default(null), ...context }).strict(),
  z.object({ action: z.literal('accept'), postId: communityId, replyId: communityId.nullable() }).strict(),
  z.object({ action: z.literal('feature'), postId: communityId }).strict(),
  z.object({ action: z.literal('report'), ...target, reason: z.string().trim().min(5).max(500) }).strict(),
  z.object({ action: z.literal('moderate'), ...target, hidden: z.boolean() }).strict(),
  z.object({ action: z.literal('remove'), ...target }).strict(),
  z.object({ action: z.literal('dismissReport'), reportId: communityId }).strict(),
]);

export type CommunityAction = z.infer<typeof communityAction>;
export const COMMUNITY_PAGE_SIZE = 20;
export const STARTER_QUESTION = 'What saying did you hear growing up that you still remember today?';
