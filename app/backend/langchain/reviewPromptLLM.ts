import { ChatOpenAI } from "@langchain/openai";
import fs from "fs";
import { SqlDatabase } from "langchain/sql_db";
import { DataSource } from "typeorm";

export async function call_reviewPromptLLM(userId: string): Promise<string> {
  // parse result to perform additional queries and LLM calls
  // if results has reviewIds and similarity_score, then we perform query to grab bodies and feed into LLM
  let llmOutput;
  const llm = new ChatOpenAI({
    modelName: "gpt-3.5-turbo",
  });
  let db: SqlDatabase;

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

    console.log("Generating review prompt for user id: ?", userId);
    const userQueries = await db.run(
      `SELECT queryId, query FROM Queries WHERE userId = ${userId}`,
    );

    console.log("in the review prompt llm and printing users queries");
    console.log(userQueries);

    llmOutput = (
      await llm.invoke(
        `Given the following queries that a user has made regarding this product,
            come up with 3 distinct and different questions to prompt the user for a review.
            The first question should be a rating of something on a 1-5 scale. The second question 
            should be a yes/no question, and the third question should be an open ended question
            about the product. 
            
            IMPORTANT: each of your questions should target a different aspect of the product, based
            on things the user has queried. 
            
            Example:\n
            
            User Queries: ["Is this board good for beginners?", "Is this product durable?", 
            "How is the design of the board?"]\n
            
            Output:\n
            1. Rate the durability of this product on a scale of 1-5.\n
            2. Would you say this board is good for beginners? (Yes/No)\n
            3. How would you describe the design of the board?\n
            
            Notice how each of these questions targets a different aspect of the user's wants when
            querying for the product. The first question targets the query about durability, the second question
            targets the query about beginners, and the third question targets the query about the design of the board.` +
          "\n" +
          userQueries,
      )
    ).content;

    console.log("in review prompt llm and printing llm output");
    console.log(llmOutput as string);

    return llmOutput as string;
  } catch (err) {
    console.error("ERROR", err);
    return "ERROR";
  }
}

export async function getReviewPromptData(userIds: string[]): Promise<{
  reviewPromptData: any[];
}> {
  const promises = userIds.map(async (userId) => {
    console.log("about to generate for ", userId);
    const llmOutput = await call_reviewPromptLLM(userId);
    console.log("This is what I got", llmOutput);
    return {
      userId: userId,
      reviewPrompt: llmOutput
    };
  });

  const output = await Promise.all(promises);
  console.log(output);
  console.log("HIDSFLKDHFLKSDJFLKSDJLF");
  return { reviewPromptData: output };
}
