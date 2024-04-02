import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { call_agent } from "~/backend/langchain/agent";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ message: "Hello, world!" });
};
export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await request.json();
  const { agentQuery, userMode, tableToQuery } = body;
  return call_agent(agentQuery, JSON.parse(userMode), tableToQuery);
};
