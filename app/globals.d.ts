declare module "*.css";

export type Review = {
  reviewerName: string;
  productId: number;
  reviewerExternalId: number;
  createdAt: string;
  updatedAt: string;
  verified: string;
  reviewId: number;
  rating: number;
  title: string;
  body: string;
};

export type Query = {
  queryId: number;
  query: string;
  userId: number;
  semanticEmbedding?: string;
};

declare global {
  var admin: any;
}

export type Category = {
  category: string;
  queries: Query[];
  summary: string;
  suggestions: string;
};
