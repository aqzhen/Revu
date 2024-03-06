import { Review } from "../../globals";

export function parseReviewData(reviews: any) {
  return reviews.map((review: any) => ({
    reviewId: review.id,
    title: review.title,
    body: review.body,
    rating: review.rating,
    reviewerExternalId: review.reviewer.external_id,
    reviewerName: review.reviewer.name,
    createdAt: review.created_at,
    updatedAt: review.updated_at,
    verified: review.verified,
  })) as Review[];
}
