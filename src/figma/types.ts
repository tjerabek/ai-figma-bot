export interface FigmaUser {
  handle: string;
  img_url: string;
  id: string;
}

export interface Vector {
  x: number;
  y: number;
}

export interface FrameOffset {
  node_id: string;
  node_offset: Vector;
}

export interface FrameOffsetRegion {
  node_id: string;
  node_offset: Vector;
  region_height: number;
  region_width: number;
  comment_pin_corner?: string;
}

export type ClientMeta = Vector | FrameOffset | FrameOffsetRegion;

export interface FigmaReaction {
  emoji: string;
  user: FigmaUser;
  created_at: string;
}

export interface FigmaComment {
  id: string;
  message: string;
  file_key: string;
  parent_id: string;
  user: FigmaUser;
  created_at: string;
  resolved_at: string | null;
  client_meta: ClientMeta;
  order_id: string;
  reactions: FigmaReaction[];
}

export interface FigmaCommentsResponse {
  comments: FigmaComment[];
}

export interface FigmaImageResponse {
  err: string | null;
  images: Record<string, string | null>;
}

export interface FigmaFileResponse {
  document: FigmaNode;
  name: string;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PendingComment {
  id: string;
  question: string;
  author: string;
  created_at: string;
  client_meta: ClientMeta;
  raw: FigmaComment;
}
