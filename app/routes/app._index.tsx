import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigation } from "@remix-run/react";
import {
  BlockStack,
  Button,
  Card,
  DataTable,
  Page,
  Tabs,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from 'react';
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
  createSellerQueriesTable,
  updatePurchasedStatus,
} from "../backend/vectordb/helpers";
import { Category, Query, Review } from "../globals";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  global.admin = admin;

  console.log("Connecting to SingleStore");
  const db = await connectToSingleStore();

  await createReviewTable(false);
  await createQueriesTable(false);
  await createEmbeddingsTable(false);
  await createSellerQueriesTable(false);
  await createPurchasesTable(false);

  await updatePurchasedStatus();

  await initialize_agent();

  console.log("Loading products");
  return getProducts();
};

export const action = async ({ request }: ActionFunctionArgs) => {};

function chunksToReviews(chunks: Chunk[]) {
  return chunks.map((chunk: Chunk, index: number) => (
    <Card key={index}>{chunks[index] && <p>{chunks[index].chunkBody}</p>}</Card>
  ));
}

export default function Index() {
  // Miscellanous
  var [selectedTab, setSelectedTab] = useState<number>(0);
  var [isPopupOpen, setIsPopupOpen] = useState(false);

  // Products
  const [products, setProducts] = useState<any[]>([]);
  var [selectedProduct, setSelectedProduct] = useState<number>();

  // Reviews
  var [reviewListDetails, setReviewListDetails] = useState<Review[]>([]); // used to store the entire list of reviews for a product
  // var [chunkBodies, setChunkBodies] = useState<string[]>([]); // used to store the list of reviews returned on a query

  // Agent Calls
  var [resultQueries, setResultQueries] = useState<string[]>([]); // used to store the list of queries returned on a query. TODO: change to Query type
  var [resultChunks, setResultChunks] = useState<Chunk[]>([]);

  var [agentQuery, setAgentQuery] = useState<string>("");
  var [agentResponse, setAgentResponse] = useState<string>(); // this is the LLM output text answer
  var [agentResult, setAgentResult] = useState<string>(); // this is the sql query result (resultIds, etc..)
  var [agentSqlQuery, setAgentSqlQuery] = useState<string>("");

  // Followups
  var [reviewPromptData, setReviewPromptData] = useState<any[]>([]);

  // Sellside Insights - Window Shoppers
  var [windowCategories, setWindowCategories] = useState<Category[]>([]);

  // Sellside Insights - Purchasing Customers
  var [purchasingCustomersInsights, setPurchasingCustomersInsights] =
    useState<string>("");
  var [purchasingCustomersQueries, setPurchasingCustomersQueries] = useState<
    Query[]
  >([]);
  var [purchasingCustomersReviews, setPurchasingCustomersReviews] = useState<
    Review[]
  >([]);
  var [purchasingCustomersCategories, setPurchasingCustomersCategories] = useState<Category[]>([]);

  const nav = useNavigation();
  const isLoading =
    ["loading", "submitting"].includes(nav.state) && nav.formMethod === "POST";
  const handleTabChange = useCallback(
    (selectedTabIndex: number) => setSelectedTab(selectedTabIndex),
    [],
  );

  const tabs = [
    {
      id: "window-shoppers-1",
      content: "Window Shoppers",
      accessibilityLabel: "Window Shoppers",
      panelID: "window-shoppers-content-1",
    },
    {
      id: "purchasing-customers-1",
      content: "Purchasing customers",
      panelID: "purchasing-customers-content-1",
    },
    {
      id: "followups-1",
      content: "Followups",
      panelID: "followups-content-1",
    },
    {
      id: "reviews-1",
      content: "Reviews",
      panelID: "reviews-content-1",
    },
  ];

  // calling api to get reviews for returned reviews/chunks after a query
  const reviewIds: number[] = [];
  const chunkNumbers: number[] = [];
  const queryIds: number[] = [];
  useEffect(() => {
    if (agentResult) {
      // TODO: Case on the queryResult to determine if it is query on reviews or queries
      const parsedResult = JSON.parse(agentResult as string);

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
  }, [agentResult]);

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
      setResultChunks(data?.chunks);
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
      setResultQueries(data?.queries);
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

  return (
    <Page>
      <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
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
          {selectedTab === 0 && (
            <>
              <Button
                onClick={async () => {
                  try {
                    const requestData = {
                      productId: selectedProduct,
                      selector: "windowShoppers",
                    };

                    const response = await fetch("/agent/sellSideInsights", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify(requestData),
                    });
                    const data = await response.json();
                    const { categories } = data;
                    setWindowCategories(categories);
                  } catch (error) {
                    // Handle any errors
                    console.error(error);
                  }
                }}
              >
                Get Insights
              </Button>
              {windowCategories && windowCategories.map((category) => (
                <Card>
                  {
                    <div key={category.category}>
                      <h1 style={{fontFamily: 'Arial, sans-serif', 
                                  color: '#0077b6',
                                  fontSize: 16 }}>           
                      <strong>Category:</strong> {category.category} </h1>
                      <p> <strong>Summary:</strong> {category.summary} </p>
                      <p> <strong>Suggestions:</strong> {category.suggestions}</p>
                      <br />
                      <details>
                        <summary> See Relevant Queries </summary>
                        {category.queries.map((query) => 
                          <div key={query.queryId}>
                            <p> <strong>Query: </strong> {query.query} (Query ID: {query.queryId}, User ID: {query.userId})</p>
                          </div>
                        )}
                      </details>
                      <br />
                    </div>
                  }
                </Card>
              ))}
            </>
          )}
          {selectedTab === 1 && (
            <>
              <Card>
                <Button
                  onClick={async () => {
                    try {
                      const requestData = {
                        productId: selectedProduct,
                        selector: "purchasingCustomers",
                      };

                      const response = await fetch("/agent/sellSideInsights", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify(requestData),
                      });
                      const data = await response.json();
                      const { categories } = data;
                      setPurchasingCustomersCategories(categories);
                    } catch (error) {
                      // Handle any errors
                      console.error(error);
                    }
                  }}
                >
                  Get Insights
                </Button>
                {purchasingCustomersCategories && purchasingCustomersCategories.map((category) => (
                <Card>
                  {
                    <div key={category.category}>
                      <h1 style={{fontFamily: 'Arial, sans-serif', 
                                  color: '#0077b6',
                                  fontSize: 16 }}>           
                      <strong>Category:</strong> {category.category} </h1>
                      <p> <strong>Summary:</strong> {category.summary} </p>
                      <p> <strong>Suggestions:</strong> {category.suggestions}</p>
                      <br />
                      <details>
                        <summary> See Relevant Queries </summary>
                        {category.queries.map((query) => 
                          <div key={query.queryId}>
                            <p> <strong>Query: </strong> {query.query} (Query ID: {query.queryId}, User ID: {query.userId})</p>
                          </div>
                        )}
                      </details>
                      <br />
                      <Button
                      onClick={async () => {
                        try {
                          const userIds: Set<number> = new Set();
                          category.queries.forEach((query) => (
                            userIds.add(query.userId)
                          ));
                          const requestData = {
                            userIds: Array.from(userIds),
                          };
                          const response = await fetch("/prompts/getReviewPromptData", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify(requestData)
                          });
                    
                          const data = await response.json();
                          console.log(data);
                          // Handle the response from the API
                          setReviewPromptData(data.reviewPromptData);
                        } catch (error) {
                          // Handle any errors
                          console.error(error);
                        }
                      }}
                    >
                    Prompt Users
                    </Button>
                    <br />
                    {reviewPromptData && 
                      reviewPromptData.map((prompt) => (
                        <div>
                          <p> Followups succesfully generated for userId: {prompt.userId}, check the followups tab!</p>
                        </div>
                      ))}
                    </div>
                  }
                </Card>
              ))}
                <p>
                  <strong>User-Wide Insights:</strong>{" "}
                  {purchasingCustomersInsights}
                </p>
              </Card>

              <input
                type="text"
                placeholder="Enter text"
                onChange={(e) => setAgentQuery(e.target.value)}
              />
              <Button
                onClick={async () => {
                  const requestData = {
                    productId: selectedProduct,
                    agentQuery: agentQuery,
                    userMode: true,
                    tableToQuery: "Review",
                  };
                  console.log(selectedProduct);
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
                    setAgentResponse(data?.output);
                    setAgentResult(data?.result);
                    setAgentSqlQuery(data?.sqlQuery);
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
                    productId: selectedProduct,
                    agentQuery: agentQuery,
                    userMode: true,
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
                    setAgentResponse(data?.output);
                    setAgentResult(data?.result);
                    setAgentSqlQuery(data?.sqlQuery);
                  } catch (error) {
                    // Handle any errors
                    console.error(error);
                  }
                }}
              >
                Query Past Queries
              </Button>
              {agentResponse && (
                <>
                  <Card>
                    <p>
                      <strong>Input Query:</strong> {agentQuery}
                    </p>
                  </Card>
                  <Card>
                    <p>
                      <strong>Agent Response:</strong>
                    </p>
                    {agentResponse && <p>{agentResponse}</p>}
                    <br /> {/* add new line */}
                    <BlockStack>
                      {agentResult &&
                        JSON.parse(agentResult).map(
                          (obj: any, index: number) => (
                            <Card key={index}>
                              {obj.similarity_score > 0.45 ? (
                                <strong>{JSON.stringify(obj)}</strong>
                              ) : (
                                JSON.stringify(obj)
                              )}

                              {resultChunks[index] && (
                                <p>{resultChunks[index].chunkBody}</p>
                              )}
                              {resultQueries && <p>{resultQueries[index]}</p>}
                            </Card>
                          ),
                        )}
                    </BlockStack>
                  </Card>
                  <Card>
                    <p>
                      <strong>SQL Query Used:</strong> {agentSqlQuery}
                    </p>
                  </Card>
                </>
              )}
            </>
          )}
          {selectedTab === 2 && (
            reviewPromptData && 
            reviewPromptData.map((review) => (
              <Card>
                <p> {review.userId} </p>
                <p> {review.reviewPrompt} </p>
              </Card>
            ))
          )}
          {selectedTab === 3 && (
            <>
              {reviewListDetails &&
                reviewListDetails.map((review, index) => (
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
            </>
          )}
        </Card>
      </Tabs>

       {
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
       }

      

      {/* {isLoading ? (
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
      ) : null} */}
    </Page>
  );
}
