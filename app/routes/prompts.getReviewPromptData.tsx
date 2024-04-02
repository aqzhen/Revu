import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { getReviewPromptData } from "~/backend/langchain/reviewPromptLLM";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return await getReviewPromptData();
};
export const action = async ({ request }: ActionFunctionArgs) => {};
