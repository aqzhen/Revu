import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  Box,
  Button,
  Card,
  DataTable,
  BlockStack,
  Page,
  Spinner,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { fetchJudgeReviews, getProducts } from "./backend/api_calls";
import { parseReviewData } from "./metafield_parsers/judge";
// import { addReviewsToDatabase } from "./backend/prisma/helpers";
import { Review } from "../globals";
import { call_agent, initialize_agent } from "./backend/langchain/agent";
import { chunk_string } from "./backend/langchain/chunking";
import {
  addChunksToSingleStore,
  addReviewsToSingleStore,
  getReviewChunksInfo,
  connectToSingleStore,
  createEmbeddingsTable,
  createQueriesTable,
  createReviewTable,
  getQueryInfo,
  createSellerQueriesTable,
} from "./backend/vectordb/helpers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  console.log("Connecting to SingleStore");
  const db = await connectToSingleStore();
  createReviewTable(false);
  createQueriesTable(false);
  createEmbeddingsTable(false);
  createSellerQueriesTable(false);

  await initialize_agent();

  console.log("Loading products");
  return getProducts(admin);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  var apiQuery = formData.get("apiQuery") as string;
  var productId = formData.get("productId") as string;
  var reviews = formData.get("reviews") as string;
  var agentQuery = formData.get("agentQuery") as string;
  var userMode = formData.get("userMode") as string;
  var chunkString = formData.get("chunkString") as string;
  var reviewIds = formData.get("reviewIds") as string;
  var chunkNumbers = formData.get("chunkNumbers") as string;
  var queryIds = formData.get("queryIds") as string;
  var tableToQuery = formData.get("tableToQuery") as string;

  if (apiQuery === "fetchJudgeReviews") {
    return fetchJudgeReviews(productId);
  } else if (apiQuery === "addReviewsToDatabase") {
    addReviewsToSingleStore(Number(productId), JSON.parse(reviews || "[]"));
    console.log("About to try to add chunks");
    addChunksToSingleStore(JSON.parse(reviews || "[]"));
    return null;
  } else if (apiQuery === "callAgent") {
    return call_agent(agentQuery, JSON.parse(userMode), tableToQuery);
  } else if (apiQuery === "chunkString") {
    return chunk_string(chunkString);
  } else if (apiQuery === "getReviewChunks") {
    let get = await getReviewChunksInfo(
      JSON.parse(reviewIds),
      JSON.parse(chunkNumbers),
    );
    return get;
  } else if (apiQuery === "getQueriesForQuery") {
    let get = await getQueryInfo(JSON.parse(queryIds));
    return get;
  }
};

export default function Index() {
  const [products, setProducts] = useState<any[]>([]);
  var [selectedProduct, setSelectedProduct] = useState<number>();
  var [reviewListDetails, setReviewListDetails] = useState<Review[]>([]); // used to store the entire list of reviews for a product
  var [chunkBodies, setChunkBodies] = useState<string[]>([]); // used to store the list of reviews returned on a query
  var [queryInfo, setQueryInfo] = useState<string[]>([]); // used to store the list of queries returned on a query
  var [queryString, setQueryString] = useState<string>("");
  var [queryResponse, setQueryResponse] = useState<string>(); // this is the LLM output text answer
  var [queryResult, setQueryResult] = useState<string>(); // this is the sql query result (resultIds, etc..)
  var [sqlQuery, setSqlQuery] = useState<string>("");

  const nav = useNavigation();
  const actionResponse = useActionData<typeof action>() as any;
  const submit = useSubmit();
  const isLoading =
    ["loading", "submitting"].includes(nav.state) && nav.formMethod === "POST";

  // calling api to get reviews for returned reviews/chunks after a query
  const reviewIds: number[] = [];
  const chunkNumbers: number[] = [];
  const userIds: number[] = [];
  const queries: string[] = [];
  const queryIds: number[] = [];
  useEffect(() => {
    if (queryResult) {
      // TODO: Case on the queryResult to determine if it is query on reviews or queries
      const parsedResult = JSON.parse(queryResult as string);

      if (parsedResult.length > 0 && parsedResult[0].reviewId) {
        parsedResult.forEach((obj: any) => {
          reviewIds.push(obj.reviewId);
          chunkNumbers.push(obj.chunkNumber);
        });
        getReviewsForQuery(reviewIds, chunkNumbers);
      } else if (parsedResult.length > 0 && parsedResult[0].queryId) {
        parsedResult.forEach((obj: any) => {
          queryIds.push(obj.queryId);
          userIds.push(obj.userId);
          queries.push(obj.query);
        });
        getQueriesForQuery(queryIds, userIds, queries);
      }
    }
  }, [queryResult]);

  useEffect(() => {
    if (actionResponse && actionResponse?.reviews) {
      var parsedData = parseReviewData(actionResponse?.reviews);
      setReviewListDetails(parsedData);
    } else if (actionResponse && actionResponse?.output) {
      setQueryResponse(actionResponse?.output);
      setQueryResult(actionResponse?.result);
      setSqlQuery(actionResponse?.sqlQuery);
    } else if (actionResponse && actionResponse?.bodies) {
      setChunkBodies(actionResponse?.bodies);
    } else if (actionResponse && actionResponse?.query) {
      setQueryInfo(actionResponse?.query);
    }
  }, [actionResponse]);

  // trigger action to get reviews
  const initializeReviews = async (selectedProductId: Number) => {
    await submit(
      { apiQuery: "fetchJudgeReviews", productId: Number(selectedProductId) },
      { replace: true, method: "POST" },
    );
  };

  const pushReviewsToDatabase = async (
    productId: number,
    reviews: Review[],
  ) => {
    await submit(
      {
        apiQuery: "addReviewsToDatabase",
        productId: productId,
        reviews: JSON.stringify(reviews),
      },
      { replace: true, method: "POST" },
    );
  };

  const getReviewsForQuery = async (
    reviewIds: number[],
    chunkNumbers: number[],
  ) => {
    await submit(
      {
        apiQuery: "getReviewChunks",
        reviewIds: JSON.stringify(reviewIds),
        chunkNumbers: JSON.stringify(chunkNumbers),
      },
      { replace: true, method: "POST" },
    );
  };

  const getQueriesForQuery = async (
    queryIds: number[],
    userIds: number[],
    queries: string[],
  ) => {
    await submit(
      {
        apiQuery: "getQueriesForQuery",
        queryIds: JSON.stringify(queryIds),
        userIds: JSON.stringify(userIds),
        queries: JSON.stringify(queries),
      },
      { replace: true, method: "POST" },
    );
  };

  // PRODUCTS
  // get products data on load
  const productsData = useLoaderData<typeof loader>();

  useEffect(() => {
    if (productsData?.products) {
      setProducts(
        productsData.products.map((edge: any) => ({
          id: edge?.node?.id,
          title: edge?.node?.title,
          imageUrl: edge?.node?.images?.edges?.[0]?.node?.url,
        })),
      );
    }
  }, []);

  // set selected product
  const handleProductSelection = async (productId: string) => {
    var trimmed_id = productId.replace("gid://shopify/Product/", "");
    setSelectedProduct(Number(trimmed_id));
    initializeReviews(Number(trimmed_id));
  };

  const [userMode, setUserMode] = useState<boolean>(true);

  return (
    <Page>
      <Card>
        <DataTable
          columnContentTypes={["text", "text", "text"]}
          headings={["Title", "ID", "Image"]}
          rows={products.map((product) => [
            <Button onClick={() => handleProductSelection(product.id)}>
              {product.title}
            </Button>,
            product.id,
            <img
              src={product.imageUrl}
              alt={product.title}
              style={{ width: "50px", height: "auto" }}
            />,
          ])}
        />
      </Card>

      <Card>
        <p>Selected Product ID: {selectedProduct}</p>
        {
          <>
            <Button
              onClick={() =>
                selectedProduct &&
                reviewListDetails.length != 0 &&
                pushReviewsToDatabase(selectedProduct, reviewListDetails)
              }
            >
              Add Reviews to Database
            </Button>
          </>
        }
      </Card>

      <Card>
        <input
          type="text"
          placeholder="Enter text"
          onChange={(e) => setQueryString(e.target.value)}
        />
        <Button
          onClick={() =>
            submit(
              {
                apiQuery: "callAgent",
                agentQuery: queryString,
                userMode: userMode,
                tableToQuery: "Review",
              },
              { replace: true, method: "POST" },
            )
          }
        >
          Query Reviews
        </Button>
        <Button
          onClick={() =>
            submit(
              {
                apiQuery: "callAgent",
                agentQuery: queryString,
                userMode: userMode,
                tableToQuery: "Queries",
              },
              { replace: true, method: "POST" },
            )
          }
        >
          Query Past Queries
        </Button>
        <Button onClick={() => setUserMode(!userMode)}>
          {userMode ? "Seller Mode" : "User Mode"}
        </Button>

        {userMode && (
          <p>Seller Mode is enabled: your queries will not be stored</p>
        )}
        {!userMode && (
          <p>
            User Mode is enabled: your queries will be stored and queriable
            later
          </p>
        )}
      </Card>

      {queryResponse && (
        <>
          <Card>
            <p>
              <strong>Input Query:</strong> {queryString}
            </p>
          </Card>
          <Card>
            <p>
              <strong>Agent Response:</strong>
            </p>
            {queryResponse && <p>{queryResponse}</p>}
            <br /> {/* add new line */}
            <BlockStack>
              {queryResult &&
                JSON.parse(queryResult).map((obj: any, index: number) => (
                  <Card key={index}>
                    {obj.similarity_score > 0.5 ? (
                      <strong>{JSON.stringify(obj)}</strong>
                    ) : (
                      JSON.stringify(obj)
                    )}

                    {chunkBodies && <p>{chunkBodies[index]}</p>}
                    {queryInfo && <p>{queryInfo[index]}</p>}
                  </Card>
                ))}
            </BlockStack>
          </Card>
          <Card>
            <p>
              <strong>SQL Query Used:</strong> {sqlQuery}
            </p>
          </Card>
        </>
      )}

      {isLoading ? (
        <Card>
          <Spinner size="small" />
          <p>Loading...</p>
        </Card>
      ) : actionResponse?.reviews ? (
        <Card>
          <p>Reviews:</p>
          {reviewListDetails.map((review, index) => (
            <Card key={index}>
              <p>Reviewer Name: {review.reviewerName}</p>
              <p>Reviewer External ID: {review.reviewerExternalId}</p>
              <p>Created At: {review.createdAt}</p>
              <p>Updated At: {review.updatedAt}</p>
              <p>Verified: {review.verified}</p>
              <p>Review ID: {review.reviewId}</p>
              <p>Rating: {review.rating}</p>
              <p>Review Title: {review.title}</p>
              <p>Review Body: {review.body}</p>
            </Card>
          ))}
        </Card>
      ) : null}
    </Page>
  );
}
