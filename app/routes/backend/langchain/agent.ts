import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { json } from "@remix-run/node";
import fs from "fs";
import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import { SqlToolkit } from "langchain/agents/toolkits/sql";
import { AIMessage } from "langchain/schema";
import { SqlDatabase } from "langchain/sql_db";
import { DataSource } from "typeorm";
import {
  addQueryToSingleStore,
  addSellerQueryToSingleStore,
} from "../vectordb/helpers";
import { call_LLM } from "./outputLLM";
import { prefix, suffix } from "./agentPrompt";

let executor: AgentExecutor;
const llm = new ChatOpenAI({
  modelName: "gpt-3.5-turbo",
});
let db: SqlDatabase;

export async function initialize_agent() {
  try {
    const dataSource = new DataSource({
      type: "mysql",
      host: process.env.SINGLESTORE_HOST,
      port: 3333,
      username: process.env.SINGLESTORE_USER,
      password: process.env.SINGLESTORE_PASSWORD,
      database: process.env.SINGLESTORE_DATABASE,
      ssl: {
        ca: fs.readFileSync("./singlestore_bundle.pem"),
      },
    });
    db = await SqlDatabase.fromDataSourceParams({
      appDataSource: dataSource,
    });
    const toolkit = new SqlToolkit(db);
    const tools = toolkit.getTools();

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", prefix],
      // new MessagesPlaceholder("chat_history"),
      HumanMessagePromptTemplate.fromTemplate("{input}"),
      new AIMessage(suffix.replace("{agent_scratchpad}", "")),
      new MessagesPlaceholder("agent_scratchpad"),
    ]);
    // const memory = new BufferMemory({
    //   memoryKey: "chat_history",
    //   returnMessages: true,
    // }); // adding memory here

    const newPrompt = await prompt.partial({
      dialect: toolkit.dialect,
    });
    const runnableAgent = await createOpenAIToolsAgent({
      llm,
      tools,
      prompt: newPrompt,
    });
    executor = new AgentExecutor({
      agent: runnableAgent,
      tools,
      returnIntermediateSteps: true,
      verbose: false,
      // memory: memory,
    });
  } catch (err) {
    console.error("ERROR", err);
  }
}

export async function call_agent(
  query: string,
  isSeller: boolean = false,
  tableToQuery: string,
) {
  let response = {
    prompt: query,
    sqlQuery: "",
    result: [],
    error: "",
    output: "",
  };
  try {
    // add query to queries table
    // TODO: figure out how to get queryID, productID

    let queryId;
    let sellerQueryId;
    if (!isSeller) {
      queryId = await addQueryToSingleStore(1, 1, "TEST ANSWER", query);
    } else {
      sellerQueryId = await addSellerQueryToSingleStore(
        1,
        2,
        "TEST ANSWER",
        query,
      );
    }

    // TODO: Add semantic caching logic here

    let result;
    if (queryId !== undefined) {
      result = await executor.invoke({
        input:
          "QueryId: " +
          queryId +
          ". Query the " +
          tableToQuery +
          " table. " +
          query,
      });
    } else if (sellerQueryId !== undefined) {
      result = await executor.invoke({
        input:
          "SellerQueryId: " +
          sellerQueryId +
          ". Query the " +
          tableToQuery +
          " table. " +
          query,
      });
    }

    if (result) {
      result.intermediateSteps.forEach((step: any) => {
        if (step.action.tool === "query-sql") {
          response.prompt = query;
          response.sqlQuery = step.action.toolInput.input;
          response.result = step.observation;
        }
      });
      console.log(
        `Intermediate steps ${JSON.stringify(result.intermediateSteps, null, 2)}`,
      );
    }

    const llmOutput = await call_LLM(
      response.result as unknown as string,
      llm,
      db,
      query,
    );

    response.output = llmOutput as string;
    console.log(response.output);
    return json(response);
  } catch (err) {
    console.error("ERROR", err);
    return null;
  }
}
