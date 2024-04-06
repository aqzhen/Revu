import { ChatOpenAI } from "@langchain/openai";
import fs from "fs";
import { SqlDatabase } from "langchain/sql_db";
import { DataSource } from "typeorm";
import { Query, Review } from "~/globals";

export async function call_windowShoppersInsightsLLM(productId: number) {
  // parse result to perform additional queries and LLM calls
  // if results has reviewIds and similarity_score, then we perform query to grab bodies and feed into LLM
  console.log("hello");
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

    const userQueries = await db.run(
      `SELECT Q.queryId, Q.query, Q.userId
      FROM Queries Q
      JOIN Purchases P
      ON Q.userId = P.userId AND Q.productId = P.productId
      WHERE Q.productId = ${productId} AND P.purchased = 0
      `,
    );

    console.log("in the sell side llm and printing users queries");
    console.log(userQueries);

    const parsedUserQueries = JSON.parse(userQueries);
    const queryList: Query[] = parsedUserQueries.map((query: any) => {
      return {
        queryId: query.queryId,
        query: query.query,
        userId: query.userId,
      };
    });

    llmOutput = (
      await llm.invoke(
        `You are given the following queries that a user has made on a product. These users have not
        purchased the product. You should synthesize these queries into an appropriate amount (1-5) 
        categories of what these users were looking for in the product when querying. For each category,
        output the specific queries, queryIds, and userIds that contributed to the category. Then, include
        a small summary of this data that is digestable for the seller. Provide 3 potential suggestions to
        improve their product in order to cater to these users and specific queries.` +
          "\n" +
          userQueries,
      )
    ).content;

    console.log("in sell side llm and printing llm output");
    console.log(llmOutput as string);

    return { llmOutput: llmOutput as string, userQueries: queryList };
  } catch (err) {
    console.error("ERROR", err);
    return "ERROR";
  }
}

export async function call_purchasingCustomersInsightsLLM(productId: number) {
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

    const userQueries = await db.run(
      `SELECT Q.queryId, Q.query, Q.userId
      FROM Queries Q
      JOIN Purchases P
      ON Q.userId = P.userId AND Q.productId = P.productId
      WHERE Q.productId = ${productId} AND P.purchased = 1
      `,
    );

    console.log("in the sell side llm and printing users queries");
    console.log(userQueries);

    const parsedUserQueries = JSON.parse(userQueries);
    const queryList: Query[] = parsedUserQueries.map((query: any) => {
      return {
        queryId: query.queryId,
        query: query.query,
        userId: query.userId,
      };
    });

    const userReviews = await db.run(
      `SELECT R.reviewId, R.productID, R.reviewerName, R.reviewerExternalId, R.createdAt, R.updatedAt, R.verified, R.rating, R.title, R.body
      FROM Review R
      JOIN Purchases P
      ON R.reviewerExternalId = P.userId AND R.productId = P.productId
      WHERE R.productId = ${productId} AND P.purchased = 1
      `,
    );

    console.log("in the sell side llm and printing users reviews");
    console.log(userReviews);
    const parsedUserReviews = JSON.parse(userReviews);
    const reviewList: Review[] = parsedUserReviews.map((review: any) => {
      return {
        reviewId: review.reviewId,
        productId: review.productId,
        reviewerName: review.reviewerName,
        reviewerExternalId: review.reviewerExternalId,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        verified: review.verified,
        rating: review.rating,
        title: review.title,
        body: review.body,
      };
    });

    llmOutput = (
      await llm.invoke(
        `You are given the following queries that a user has made on a product, in addition to the reviews that they left on the product. You should synthesize these queries into an appropriate amount (1-5) 
        categories of what these users were looking for in the product when querying. For each category,
        output the specific queries, queryIds, and userIds that contributed to the category. Correspondingly, you should discuss how the content within the reviews address the categories and ideas brought up in the queries. Then, include a small summary of this data that is digestable for the seller. Provide 3 potential suggestions to
        improve their product in order to cater to these users and specific queries.` +
          "\n" +
          userQueries +
          userReviews,
      )
    ).content;

    console.log("in sell side llm and printing llm output");
    console.log(llmOutput as string);

    return {
      llmOutput: llmOutput as string,
      userQueries: queryList,
      userReviews: reviewList,
    };
  } catch (err) {
    console.error("ERROR", err);
    return "ERROR";
  }
}
