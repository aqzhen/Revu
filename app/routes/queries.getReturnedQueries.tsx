import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { getQueryInfo } from "~/backend/vectordb/helpers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ message: "Hello, world!" });
};
export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await request.json();
  const { queryIds } = body;
  return await getQueryInfo(queryIds);
};
