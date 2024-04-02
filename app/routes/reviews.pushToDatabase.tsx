import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import {
  addChunksToSingleStore,
  addReviewsToSingleStore,
} from "~/backend/vectordb/helpers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ message: "Hello, world!" });
};
export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await request.json();
  const { productId, reviews } = body;
  addReviewsToSingleStore(Number(productId), reviews);
  console.log("About to try to add chunks");
  addChunksToSingleStore(reviews);
};
