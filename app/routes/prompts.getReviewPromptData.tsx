import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { getReviewPromptData } from "~/backend/langchain/reviewPromptLLM";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ message: "Hello, world!" });
};
export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("IN THIS API CALL REVIEW PROMPT DATA");
  const body = await request.json();
  const { userIds } = body

  console.log(userIds[0]);


  return await getReviewPromptData(userIds);
};
