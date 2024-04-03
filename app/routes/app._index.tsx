import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  useLoaderData,
  useNavigation
} from "@remix-run/react";
import {
  BlockStack,
  Button,
  Card,
  DataTable,
  Page,
  Spinner,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import { getProducts } from "../backend/api_calls";
import { parseReviewData } from "../metafield_parsers/judge";
import { authenticate } from "../shopify.server";
// import { addReviewsToDatabase } from "./backend/prisma/helpers";
import { initialize_agent } from "../backend/langchain/agent";
import { Chunk } from "../backend/langchain/chunking";
import {
  connectToSingleStore,
  createEmbeddingsTable,
  createPurchasesTable,
  createQueriesTable,
  createReviewTable,
  createSellerQueriesTable
} from "../backend/vectordb/helpers";
import Popup from "../frontend/components/Popup";
import { Review } from "../globals";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  console.log("Connecting to SingleStore");
  const db = await connectToSingleStore();

  createReviewTable(false);
  createQueriesTable(false);
  createEmbeddingsTable(false);
  createSellerQueriesTable(false);
  createPurchasesTable(false);

  await initialize_agent();
  // await call_sellSideInsightsLLM(9064572584236);

  console.log("Loading products");
  return getProducts(admin);
};

export const action = async ({ request }: ActionFunctionArgs) => {};

function chunksToReviews(chunks: Chunk[]) {
  return chunks.map((chunk: Chunk, index: number) => (
    <Card key={index}>{chunks[index] && <p>{chunks[index].chunkBody}</p>}</Card>
  ));
}

export default function Index() {
  const [products, setProducts] = useState<any[]>([]);
  var [selectedProduct, setSelectedProduct] = useState<number>();
  var [reviewListDetails, setReviewListDetails] = useState<Review[]>([]); // used to store the entire list of reviews for a product
  // var [chunkBodies, setChunkBodies] = useState<string[]>([]); // used to store the list of reviews returned on a query
  var [queryInfo, setQueryInfo] = useState<string[]>([]); // used to store the list of queries returned on a query. TODO: change to Query type
  var [queryString, setQueryString] = useState<string>("");
  var [queryResponse, setQueryResponse] = useState<string>(); // this is the LLM output text answer
  var [queryResult, setQueryResult] = useState<string>(); // this is the sql query result (resultIds, etc..)
  var [sqlQuery, setSqlQuery] = useState<string>("");
  var [relevantChunks, setRelevantChunks] = useState<Chunk[]>([]);
  var [isPopupOpen, setIsPopupOpen] = useState(false);
  var [reviewPromptData, setReviewPromptData] = useState<string[]>([]);
  var [sellSideInsights, setSellSideInsights] = useState<string>("");

  const nav = useNavigation();
  const isLoading =
    ["loading", "submitting"].includes(nav.state) && nav.formMethod === "POST";

  // calling api to get reviews for returned reviews/chunks after a query
  const reviewIds: number[] = [];
  const chunkNumbers: number[] = [];
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
        });
        getQueriesForQuery(queryIds);
      }
    }
  }, [queryResult]);

  // trigger action to get reviews
  const initializeReviews = async (selectedProductId: Number) => {
    const requestData = {
      productId: selectedProductId,
    };
    try {
      const response = await fetch("/reviews/fetchAll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      // Handle the response from the API
      var parsedData = parseReviewData(data.reviews);
      setReviewListDetails(parsedData);
    } catch (error) {
      // Handle any errors
      console.error(error);
    }
  };

  const pushReviewsToDatabase = async (
    productId: number,
    reviews: Review[],
  ) => {
    const requestData = {
      productId: productId,
      reviews: reviews,
    };
    try {
      const response = await fetch("/reviews/pushToDatabase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });
    } catch (error) {
      // Handle any errors
      console.error(error);
    }
  };

  const getReviewsForQuery = async (
    reviewIds: number[],
    chunkNumbers: number[],
  ) => {
    const requestData = {
      reviewIds: reviewIds,
      chunkNumbers: chunkNumbers,
    };
    try {
      const response = await fetch("/reviews/getChunks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      // Handle the response from the API
      setRelevantChunks(data?.chunks);
    } catch (error) {
      // Handle any errors
      console.error(error);
    }
  };

  const getQueriesForQuery = async (queryIds: number[]) => {
    const requestData = {
      queryIds: queryIds,
    };
    try {
      const response = await fetch("/queries/getReturnedQueries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      // Handle the response from the API
      setQueryInfo(data?.queries);
    } catch (error) {
      // Handle any errors
      console.error(error);
    }
  };

  const togglePopup = async () => {
    setIsPopupOpen(!isPopupOpen);
    try {
      const response = await fetch("/prompts/getReviewPromptData", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      // Handle the response from the API
      setReviewPromptData(data?.reviewPromptData);
    } catch (error) {
      // Handle any errors
      console.error(error);
    }
  };

  const closePopup = () => {
    setIsPopupOpen(false); // Close the popup
    setReviewPromptData([]);
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
          onClick={async () => {
            const requestData = {
              agentQuery: queryString,
              userMode: userMode,
              tableToQuery: "Review",
            };
            try {
              const response = await fetch("/agent", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(requestData),
              });

              const data = await response.json();

              // Handle the response from the /agent API
              setQueryResponse(data?.output);
              setQueryResult(data?.result);
              setSqlQuery(data?.sqlQuery);
            } catch (error) {
              // Handle any errors
              console.error(error);
            }
          }}
        >
          Query Reviews
        </Button>
        <Button
          onClick={async () => {
            const requestData = {
              agentQuery: queryString,
              userMode: userMode,
              tableToQuery: "Query",
            };
            try {
              const response = await fetch("/agent", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(requestData),
              });

              const data = await response.json();

              // Handle the response from the /agent API
              setQueryResponse(data?.output);
              setQueryResult(data?.result);
              setSqlQuery(data?.sqlQuery);
            } catch (error) {
              // Handle any errors
              console.error(error);
            }
          }}
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
                    {obj.similarity_score > 0.45 ? (
                      <strong>{JSON.stringify(obj)}</strong>
                    ) : (
                      JSON.stringify(obj)
                    )}

                    {relevantChunks[index] && (
                      <p>{relevantChunks[index].chunkBody}</p>
                    )}
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

      {
        <Card>
          <Button
            onClick={async () => {
              try {
                const response = await fetch("/agent/sellSide", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(selectedProduct),
                });
                const data = await response.json();
                setSellSideInsights(data);
              } catch (error) {
                // Handle any errors
                console.error(error);
              }
            }}
          >
          Get Sell Side Insights
          </Button>
          { sellSideInsights }
        </Card>
      }

      {
        <Card>
          <div>
            <h1>Main Component</h1>
            <button onClick={togglePopup}>Generate Review Prompt</button>
            {isPopupOpen && (
              <Popup data={reviewPromptData} onClose={closePopup} />
            )}
          </div>
        </Card>
      }

      {isLoading ? (
        <Card>
          <Spinner size="small" />
          <p>Loading...</p>
        </Card>
      ) : reviewListDetails ? (
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
      ) : relevantChunks ? (
        <BlockStack>
          {relevantChunks && chunksToReviews(relevantChunks)}
        </BlockStack>
      ) : null}
    </Page>
  );
}
