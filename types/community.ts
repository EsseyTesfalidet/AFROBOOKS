export type CommunityKind = 'weekly' | 'memory';
export type CommunityStatus = 'active' | 'hidden' | 'removed';

export interface CommunityPost {
  id: string;
  kind: CommunityKind;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  country: string;
  language: string;
  status: CommunityStatus;
  createdAt: number;
  replyCount: number;
  acceptedReplyId: string | null;
}

export interface CommunityReply {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  country: string;
  language: string;
  status: CommunityStatus;
  createdAt: number;
  parentReplyId: string | null;
  parentAuthorName: string | null;
}

export interface CommunityReport {
  id: string;
  postId: string;
  replyId: string | null;
  reason: string;
  createdAt: number;
}

export interface CommunityFeed {
  posts: CommunityPost[];
  featured: CommunityPost | null;
  nextCursor: string | null;
  reports?: CommunityReport[];
}

export interface CommunityThread {
  post: CommunityPost;
  replies: CommunityReply[];
  acceptedReply: CommunityReply | null;
  focusedReply: CommunityReply | null;
  nextCursor: string | null;
}
