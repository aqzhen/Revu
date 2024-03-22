import fs from "fs";
import mysql from "mysql2/promise";
import OpenAI from "openai";
import { Review } from "../../../globals";
import { chunk_string } from "../langchain/chunking";
import { log } from "console";

let singleStoreConnection: mysql.Connection;
export async function connectToSingleStore() {
  try {
    singleStoreConnection = await mysql.createConnection({
      host: process.env.SINGLESTORE_HOST,
      user: process.env.SINGLESTORE_USER,
      port: 3333,
      password: process.env.SINGLESTORE_PASSWORD,
      database: process.env.SINGLESTORE_DATABASE,
      ssl: {
        ca: fs.readFileSync("./singlestore_bundle.pem"),
      },
    });
    console.log("You have successfully connected to SingleStore.");
    return singleStoreConnection;
  } catch (err) {
    console.error("ERROR", err);
    process.exit(1);
  }
}

process.on("exit", async () => {
  await disconnectFromSingleStore();
});

export async function disconnectFromSingleStore() {
  try {
    await singleStoreConnection.end();
    console.log("Disconnected from SingleStore.");
  } catch (err) {
    console.error("ERROR", err);
    process.exit(1);
  }
}

export async function createReviewTable(deleteExistingReviews: boolean) {
  try {
    if (deleteExistingReviews) {
      await singleStoreConnection.execute("DROP TABLE IF EXISTS Review");
    }
    await singleStoreConnection.execute(`
            CREATE TABLE Review (
                productId BIGINT,
                reviewId BIGINT,
                reviewerName VARCHAR(255),
                reviewerExternalId BIGINT,
                createdAt TIMESTAMP,
                updatedAt TIMESTAMP,
                verified VARCHAR(255),
                rating INT,
                title VARCHAR(255),
                body TEXT,
                PRIMARY KEY (productId, reviewId)
            )
        `);
    console.log("Reviews table created successfully.");
  } catch (err) {
    console.log("Reviews table already exists");
  }
}

export async function createQueriesTable(deleteExistingReviews: boolean) {
  try {
    if (deleteExistingReviews) {
      await singleStoreConnection.execute("DROP TABLE IF EXISTS Queries");
    }
    await singleStoreConnection.execute(`
                CREATE TABLE Queries (
                    queryId BIGINT AUTO_INCREMENT PRIMARY KEY,
                    productId BIGINT,
                    userId BIGINT,
                    query TEXT,
                    queryEmbedding VECTOR(1536), -- OpenAI embeddings are 1536-dimensional, embedding for entire query
                    semanticEmbedding VECTOR(768), -- OpenAI embeddings are 1536-dimensional, semantic embedding is embedding for relevant context of query
                    answer TEXT
                )
            `);
    console.log("Queries table created successfully.");
  } catch (err) {
    console.log("Queries table already exists");
  }
}

export async function createEmbeddingsTable(deleteExistingReviews: boolean) {
  try {
    if (deleteExistingReviews) {
      console.log("Dropping embedding table");

      await singleStoreConnection.execute("DROP TABLE IF EXISTS Embeddings");
    }
    await singleStoreConnection.execute(`
                CREATE TABLE Embeddings (
                    reviewId BIGINT,
                    chunkNumber BIGINT,
                    body TEXT,
                    chunkEmbedding VECTOR(768),
                    PRIMARY KEY (reviewId, chunkNumber)
                )
            `);
    console.log("Embeddings table created successfully.");
  } catch (err) {
    console.log("Embeddings table already exists");
  }
}

export async function addChunksToSingleStore(reviews: Review[]): Promise<void> {
  for (const review of reviews) {
    const chunks = await chunk_string(review.body);
    let i = 1;
    for (const chunk of chunks) {
      try {
        const [results, buff] = await singleStoreConnection.execute(`
          INSERT IGNORE INTO Embeddings (
              reviewId,
              chunkNumber,
              body
          ) VALUES (
              ${review.reviewId},
              ${i},
              '${chunk.replace(/'/g, "\\'")}'
          )
      `);

        // only generate embedding if the review was added (new review)
        if ((results as any).affectedRows > 0) {
          const embedding = await generateEmbedding(chunk);
          // Do something with the embedding
          await singleStoreConnection.execute(
            `
            UPDATE Embeddings
            SET chunkEmbedding = ?
            WHERE reviewId = ? AND chunkNumber = ?
          `,
            [embedding, review.reviewId, i],
          );
          console.log("Chunk added successfully.");
        }
        i = i + 1;
      } catch (err) {
        console.log("Error adding chunks");
        console.log(err);
        process.exit(1);
      }
    }
  }
  console.log("Added chunks for all reviews");
}

// Add reviews to the SingleStore database, also index review bodies using OpenAI embeddings
export async function addReviewsToSingleStore(
  productId: number,
  reviews: Review[],
): Promise<void> {
  for (const review of reviews) {
    try {
      const [results, buff] = await singleStoreConnection.execute(`
        INSERT IGNORE INTO Review (
            productId,
            reviewId,
            reviewerName,
            reviewerExternalId,
            createdAt,
            updatedAt,
            verified,
            rating,
            title,
            body
        ) VALUES (
            ${productId},
            ${review.reviewId},
            '${review.reviewerName.replace(/'/g, "\\'")}',
            ${review.reviewerExternalId},
            '${review.createdAt}',
            '${review.updatedAt}',
            '${review.verified}',
            ${review.rating},
            '${review.title.replace(/'/g, "\\'")}',
            '${review.body.replace(/'/g, "\\'")}'
        )
    `);
    } catch (err) {
      console.error("ERROR", err);
      process.exit(1);
    }
  }
}

export async function addQueryToSingleStore(
  productId: number,
  userId: number,
  answer: string,
  query: string,
): Promise<void> {
  try {
    const [results, buff] = await singleStoreConnection.execute(
      `
        INSERT INTO Queries (
            productId,
            userId,
            answer
        ) VALUES (
            ${productId},
            ${userId},
            '${answer.replace(/'/g, "\\'")}'
        )
        `,
    );
    // only generate embedding if the review was added (new review)
    if ((results as any).affectedRows > 0) {
      // TODO: don't need query embedding for now, but will need for semantic cache
      // const embedding = await generateEmbedding(query);
      // await singleStoreConnection.execute(
      //   `
      //     UPDATE Queries
      //     SET embedding = ?
      //     WHERE queryId = ?
      //   `,
      //   [embedding, queryId],
      // );

      // get semantic context from LLM
      // const queryContext = OpenAI.

      const queryId = (results as any).insertId;

      // generate embedding and add to db
      const semanticEmbdding = await generateEmbedding(query);
      await singleStoreConnection.execute(
        `
          UPDATE Queries
          SET semanticEmbedding = ?
          WHERE queryId = ?
        `,
        [semanticEmbdding, queryId],
      );

      console.log("Query added successfully.");
      return queryId;
    }
  } catch (err) {
    console.error("ERROR", err);
    process.exit(1);
  }
}

async function generateEmbedding(body: string) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  body = body.replace("\n", " ");
  let embedding: number[] = (
    await client.embeddings.create({
      input: [body],
      model: "text-embedding-3-small",
      dimensions: 768,
    })
  ).data[0].embedding;
  return JSON.stringify(embedding);
}
