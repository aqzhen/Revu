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

let executor: AgentExecutor;
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

    const db = await SqlDatabase.fromDataSourceParams({
      appDataSource: dataSource,
    });
    const toolkit = new SqlToolkit(db);
    const tools = toolkit.getTools();
    const llm = new ChatOpenAI({
      modelName: "gpt-3.5-turbo",
    });

    // \n Example 1:
    // Q: QueryId: 1234. What is the number of reviews that describe being beginners at snowboarding?
    // A:

    // \nThought: I should use the DOT_PRODUCT function to calculate the similarity between the embedding of the query and the bodyEmbedding of the review. Then I can count the number of reviews that have a similarity greater than 0.8 to the query.
    // \nAction: query-sql
    // \nAction Input:
    //     SELECT COUNT(*)
    //     FROM review
    //     WHERE DOT_PRODUCT(bodyEmbedding, (SELECT embedding FROM queries WHERE queryId = 1234)) > 0.8;
    // \nObservation: 5
    // \nThought: I now know the final answer
    // \nFinal Answer: 5

    // const prefix = `
    // You are an agent designed to interact with a SQL database called SingleStore. This sometimes has Shard and Sort keys in the table schemas, which you can ignore.
    // \nGiven an input question, create a syntactically correct MySQL query to run, then look at the results of the query and return the answer.
    // \n If you are asked about similarity questions, you should use the DOT_PRODUCT function. The table has one column with vector data called bodyEmbedding.
    // The DOT_PRODUCT function takes two vectors and returns the dot product of the two vectors. The result is a scalar value.
    // The DOT_PRODUCT function is used to calculate the similarity between two vectors. The result is a scalar value. The higher the value, the more similar the two vectors are. The lower the value, the less similar the two vectors are.

    // The first piece of information you will be given will be the queryID. This is a unique number identifier for the query. You should read the queryID and use it to query the queries table. When deciding if a query is similar to the body of a review, you should use the DOT_PRODUCT function to calculate the similarity between the embedding of the query and the bodyEmbedding of the review.

    // If the query is asking you to return information about reviews that are similar to the query, you should use the DOT_PRODUCT function to calculate the similarity between the embedding of the query and the bodyEmbedding of the review. You should then return the reviews that have the highest similarity to the query. You should return the reviews in descending order of similarity. You should return at most {top_k} reviews. If there are no reviews that are similar to the query, you should return an empty list.

    // Anytime you are enticed to use the WHERE function, you should use the DOT_PRODUCT function instead of LIKE to compute the similarity between the
    // embedding of the query and the bodyEmbedding of the review.

    // \nIf you are asked to describe the database, you should run the query SHOW TABLES
    // \nUnless the user specifies a specific number of examples they wish to obtain, always limit your query to at most {top_k} results.
    // \nYou can order the results by a relevant column to return the most interesting examples in the database.
    // \nNever query for all the columns from a specific table, only ask for the relevant columns given the question.
    // \n You have access to tools for interacting with the database. Only use the below tools.Only use the information returned by the below tools to construct your final answer. These are the tools: [query-sql, list-tables-sql]
    // \nYou MUST double check your query before executing it. If you get an error while executing a query, rewrite the query and try again up to 3 times.
    // \n\nDO NOT make any DML statements (INSERT, UPDATE, DELETE, DROP etc.) to the database.
    // \n\nIf the question does not seem related to the database, just return "I don\'t know" as the answer.\n,
    // `;
    // const suffix = `
    // Use the following format:\n
    // \nQuestion: the input question you must answer
    // \nFinal Answer: the final answer to the original input question
    // \nSQL Query used to get the Answer: the final sql query used for the final answer
    // `;

    const prefix = `
    You are an agent designed to interact with a SQL database.
    Given an input question, create a syntactically correct {dialect} query to run, then look at the results of the query and return the answer.
    Unless the user specifies a specific number of examples they wish to obtain, always limit your query to at most {top_k} results using the LIMIT clause.
    You can order the results by a relevant column to return the most interesting examples in the database.
    Never query for all the columns from a specific table, only ask for a the few relevant columns given the question.
    You have access to tools for interacting with the database.
    Only use the below tools.
    Only use the information returned by the below tools to construct your final answer.
    You MUST double check your query before executing it. If you get an error while executing a query, rewrite the query and try again.

    DO NOT make any DML statements (INSERT, UPDATE, DELETE, DROP etc.) to the database.

    If the question does not seem related to the database, just return "I don't know" as the answer.`;

    const suffix = `
    Begin!

    Question: {input}
    Thought: I should look at the tables in the database to see what I can query.
    {agent_scratchpad}
    `;

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", prefix],
      HumanMessagePromptTemplate.fromTemplate("{input}"),
      new AIMessage(suffix.replace("{agent_scratchpad}", "")),
      new MessagesPlaceholder("agent_scratchpad"),
    ]);
    const newPrompt = await prompt.partial({
      dialect: toolkit.dialect,
      top_k: "10",
    });
    const runnableAgent = await createOpenAIToolsAgent({
      llm,
      tools,
      prompt: newPrompt,
    });
    executor = new AgentExecutor({
      agent: runnableAgent,
      tools,
      returnIntermediateSteps : true,
      verbose : true
    });
  } catch (err) {
    console.error("ERROR", err);
  }
}

export async function call_agent(query: string) {
  let response = {
    prompt: query,
    sqlQuery: "",
    result: [],
    error: "",
    output: ""
  };
  try {
    // add query to queries table
    // TODO: figure out how to get queryID, productID
    // let queryId = 2;
    // await addQueryToSingleStore(queryId, 1, 1, "TEST ANSWER", query);

    // TODO: Add semantic caching logic here

    const result = await executor.invoke({
      input: query,
    });

    // result.intermediateSteps.forEach((step: any) => {
    //   //   if (step.action.tool === "query-sql") {
    //   //     response.prompt = query;
    //   //     response.sqlQuery = step.action.toolInput;
    //   //     response.result = JSON.parse(step.observation);
    //   //   }

    //   console.log("HIII");
    //   console.log(
    //     `Intermediate steps ${JSON.stringify(result.intermediateSteps, null, 2)}`,
    //   );
    // });
    console.log(result);
    // console.log(result.intermediateSteps.stringify);
    response.output = result.output;
    return json(response);
  } catch (err) {
    console.error("ERROR", err);
    return null;
  }
}
