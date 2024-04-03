import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { call_sellSideInsightsLLM } from "~/backend/langchain/sellSideInsightsLLM";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ message: "Hello, world!" });
};
export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await request.json();
  const { productId } = body;
  return await call_sellSideInsightsLLM(9064572584236);
};
