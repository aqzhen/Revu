import fs from "fs";
import mysql, { RowDataPacket } from "mysql2/promise";
import OpenAI from "openai";
import { Review } from "../../../globals";
import { chunk_string } from "../langchain/chunking";
import { json } from "@remix-run/node";

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

// Create Tables
export async function createReviewTable(deleteExistingReviews: boolean) {
  try {
    if (deleteExistingReviews) {
      await singleStoreConnection.execute("DROP TABLE IF EXISTS Review");
    }
    await singleStoreConnection.execute(`
            CREATE TABLE Review (
                reviewId BIGINT PRIMARY KEY,
                productId BIGINT,
                reviewerName VARCHAR(255),
                reviewerExternalId BIGINT,
                createdAt TIMESTAMP,
                updatedAt TIMESTAMP,
                verified VARCHAR(255),
                rating INT,
                title VARCHAR(255),
                body TEXT
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
                    queryEmbedding VECTOR(768), -- OpenAI embeddings are 768-dimensional, embedding for entire query
                    semanticEmbedding VECTOR(768), -- OpenAI embeddings are 768-dimensional, semantic embedding is embedding for relevant context of query
                    answer TEXT
                )
            `);
    console.log("Queries table created successfully.");
  } catch (err) {
    console.log("Queries table already exists");
  }
}

export async function createSellerQueriesTable(deleteExistingReviews: boolean) {
  try {
    if (deleteExistingReviews) {
      await singleStoreConnection.execute(
        "DROP TABLE IF EXISTS Seller_Queries",
      );
    }
    await singleStoreConnection.execute(`
                CREATE TABLE Seller_Queries (
                  queryId BIGINT AUTO_INCREMENT PRIMARY KEY,
                  productId BIGINT,
                  userId BIGINT,
                  query TEXT,
                  queryEmbedding VECTOR(768), -- OpenAI embeddings are 768-dimensional, embedding for entire query
                  semanticEmbedding VECTOR(768), -- OpenAI embeddings are 768-dimensional, semantic embedding is embedding for relevant context of query
                  answer TEXT
              )
          `);
    console.log("Seller_Queries table created successfully.");
  } catch (err) {
    console.log("Seller_Queries table already exists");
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

// Adders
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
            reviewId,
            productId,
            reviewerName,
            reviewerExternalId,
            createdAt,
            updatedAt,
            verified,
            rating,
            title,
            body
        ) VALUES (
            ${review.reviewId},
            ${productId},
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
            query,
            answer
        ) VALUES (
            ${productId},
            ${userId},
            '${query}',
            '${answer.replace(/'/g, "\\'")}'
        )
        `,
    );
    // only generate embedding if the query was added (this always happens for now, since queries aren't deduplicated)
    if ((results as any).affectedRows > 0) {
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

export async function addSellerQueryToSingleStore(
  productId: number,
  userId: number,
  answer: string,
  query: string,
): Promise<void> {
  try {
    const [results, buff] = await singleStoreConnection.execute(
      `
        INSERT INTO Seller_Queries (
            productId,
            userId,
            query,
            answer
        ) VALUES (
            ${productId},
            ${userId},
            '${query}',
            '${answer.replace(/'/g, "\\'")}'
        )
        `,
    );

    // only generate embedding if the query was added (this always happens for now, since queries aren't deduplicated)
    if ((results as any).affectedRows > 0) {
      const queryId = (results as any).insertId;

      // generate embedding and add to db
      const semanticEmbdding = await generateEmbedding(query);
      await singleStoreConnection.execute(
        `
          UPDATE Seller_Queries
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

// Getters
export async function getReviewChunksInfo(
  reviewIDs: number[],
  chunkNumbers: number[],
): Promise<{ bodies: string[] }> {
  try {
    console.log("Getting review chunks", reviewIDs, chunkNumbers);
    const bodies: string[] = [];
    for (let i = 0; i < reviewIDs.length; i++) {
      const reviewID = reviewIDs[i];
      const chunkNumber = chunkNumbers[i];
      const [results, buff] = await singleStoreConnection.execute(
        `
          SELECT body FROM Embeddings WHERE reviewId = ? AND chunkNumber = ?
        `,
        [reviewID, chunkNumber],
      );
      const body = JSON.parse(JSON.stringify(results as RowDataPacket[]))[0]
        ?.body;
      bodies.push(body);
    }
    return { bodies };
  } catch (err) {
    console.error("ERROR", err);
    process.exit(1);
  }
}

export async function getQueryInfo(
  queryIds: number[],
): Promise<{ userIds: number[]; queries: string[] }> {
  try {
    const userIds: number[] = [];
    const queries: string[] = [];
    for (let i = 0; i < queryIds.length; i++) {
      const queryId = queryIds[i];
      const [results, buff] = await singleStoreConnection.execute(
        `
        SELECT userId, query FROM Queries WHERE queryId = ?
      `,
        [queryId],
      );
      const userId = JSON.parse(JSON.stringify(results as RowDataPacket[]))[0]
        ?.query;
      const query = JSON.parse(JSON.stringify(results as RowDataPacket[]))[0];
      userIds.push(userId);
      queries.push(query);
    }
    return { userIds: userIds, queries: queries };
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
