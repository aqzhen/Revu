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
import { addQueryToSingleStore } from "../vectordb/helpers";

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

    const prefix = `

    You are an agent designed to interact with a SQL database.
    Given an input question, create a syntactically correct {dialect} query to run, then look at the results of the query and return the answer.
    If you are asked to describe the database, you should run the query SHOW TABLES
    Unless the user specifies a specific number of examples they wish to obtain, always limit your query to at most {top_k} results.
    The question embeddings and answer embeddings are very long, so do not show them unless specifically asked to.
    You can order the results by a relevant column to return the most interesting examples in the database.
    Never query for all the columns from a specific table, only ask for the relevant columns given the question.
    You have access to tools for interacting with the database.\nOnly use the below tools.
    Only use the information returned by the below tools to construct your final answer.
    You MUST double check your query before executing it. If you get an error while executing a query, rewrite the query and try again up to 3 times.
    If the question does not seem related to the database, just return "I don\'t know" as the answer.\n
    DO NOT make any DML statements (INSERT, UPDATE, DELETE, DROP etc.) to the database.
    DO NOT make any CREATE statements in the database.

    The content of the review is in the body column, and the vector embedding of the body is in the bodyEmbedding column.

    If you are asked anything about the content of the review, you should use the DOT_PRODUCT function to calculate the similarity between the semanticEmbedding of the query, which is found in the Queries table, and the embedding of the chunks
    of the reviews, found in the Embeddings table.
    Use the DOT_PRODUCT function on the body column as you normally would when using the WHERE...LIKE functionality in SQL. You should NEVER return the review body in the final answer.

    You should never use a LIKE clauses when creating a SQL query. Instead, you should always use the DOT_PRODUCT function on the embeddings to determine
    similarity between the input query and the review body.

    When performing similarity computations, you should use a JOIN on the Embeddings table and compare the semanticEmbedding of the query
    with all of the chunks found in the Embeddings table. 
    
    The reviewId in the Embeddings table is a foreign key which references the reviewId from the Review table.
    Always return the reviewID, chunkNumber, and body (from Embeddings table) and the similarity score in the final answer by default.
    The body of the chunk is the 'body' column found in the Embeddings table.

    You should ALWAYS return the chunk body (Embeddings.body) in the output.

    NEVER use a threshold for the similarity score in the output. Just return the top 5 results.

    \n Example 1:
    Q: QueryId: 1234. What is the number of reviews that describe being beginners at snowboarding?
    A:

    \nThought: I should use the DOT_PRODUCT function to calculate the similarity between the embedding of the query and the bodyEmbedding of the review. 
    Then I can return the top most similar reviews in order of their similarity rank.

    \nAction: query-sql
    \nAction Input:
    SELECT COUNT(*) AS num_rows,
        DOT_PRODUCT(Query.semanticEmbedding, Emeddings.chunkEmbedding) AS similarity_score
    FROM Review JOIN Embeddings ON Review.reviewId = Embeddings.reviewId
    CROSS JOIN (SELECT semanticEmbedding FROM Queries WHERE queryId = 1234) AS Query
    ORDER BY similarity_score DESC; 
    LIMIT 5;


    \n Example 2:
    Q: QueryId: 1234. Is this board good for beginners?

    \nThought: I should use the DOT_PRODUCT function to calculate the similarity between the embedding of the query and the bodyEmbedding of the review. 
    Then I can return the top most similar reviews in order of their similarity rank. Then, I can return the reviewIDs of the reviews that are most similar
    to the query. 

    \nAction: query-sql
    \nAction Input:
    SELECT reviewId,
        DOT_PRODUCT(Review.bodyEmbedding, Query.semanticEmbedding) AS similarity_score
    FROM Review
    CROSS JOIN (SELECT semanticEmbedding FROM Queries WHERE queryId = 1234) AS Query
    ORDER BY similarity_score DESC; 
    LIMIT 5;
    `;
    const suffix = `
    Begin!
    Question: {input}
    Thought: I should look at the tables in the database to see what I can query.
    {agent_scratchpad}
    `;

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
      returnIntermediateSteps: true,
      verbose: false,
      // memory: memory,
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
    output: "",
  };
  try {
    // add query to queries table
    // TODO: figure out how to get queryID, productID
    const queryId = await addQueryToSingleStore(1, 1, "TEST ANSWER", query);

    // TODO: Add semantic caching logic here

    const result = await executor.invoke({
      input: "queryId: " + queryId + " " + query,
    });

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
    // parse result to perform additional queries and LLM calls
    // if results has reviewIds and similarity_score, then we perform query to grab bodies and feed into LLM
    let llmOutput;
    const resultObject = JSON.parse(response.result as unknown as string);
    if (resultObject.length > 0 && (resultObject[0] as any).reviewId) {
      // get reviewIds
      const reviewIds = resultObject.map((r: any) => r.reviewId);
      // get review bodies
      const reviewBodies = await db.run(
        `SELECT reviewId, body FROM Review WHERE reviewId IN (${reviewIds.join(
          ",",
        )})`,
      );

      llmOutput = (
        await llm.invoke(
          "Using the following reviews, answer this query: " +
            query +
            "\n" +
            reviewBodies,
        )
      ).content;
    }

    response.output = llmOutput + "\n" + result.output;
    console.log(response.output);
    return json(response);
  } catch (err) {
    console.error("ERROR", err);
    return null;
  }
}
