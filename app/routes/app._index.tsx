import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit
} from "@remix-run/react";
import {
  Button,
  Card,
  DataTable,
  Page,
  Spinner
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
  connectToSingleStore,
  createEmbeddingsTable,
  createQueriesTable,
  createReviewTable
} from "./backend/vectordb/helpers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  console.log("Connecting to SingleStore");
  const db = await connectToSingleStore();
  createReviewTable(false);
  createQueriesTable(true);
  createEmbeddingsTable(false);

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
  var chunkString = formData.get("chunkString") as string;
  

  console.log(productId);

  if (apiQuery === "fetchJudgeReviews") {
    return fetchJudgeReviews(productId);
  } else if (apiQuery === "addReviewsToDatabase") {
    addReviewsToSingleStore(Number(productId), JSON.parse(reviews || "[]"));
    console.log("About to try to add chunks");
    addChunksToSingleStore(JSON.parse(reviews || "[]"));
    return null;
  } else if (apiQuery === "callAgent") {
    return call_agent(agentQuery);
  } else if (apiQuery === "chunkString") {
    return chunk_string(chunkString);
  }
};

export default function Index() {
  const [products, setProducts] = useState<any[]>([]);
  var [selectedProduct, setSelectedProduct] = useState<number>();
  var [reviewDetails, setReviewDetails] = useState<Review[]>([]);
  var [queryString, setQueryString] = useState<string>("");
  var [queryResponse, setQueryResponse] = useState<undefined>();
  var [sqlQuery, setSqlQuery] = useState<string>("");
  var [chunkString, setChunkString] = useState<string>("");

  // get metafield data
  const nav = useNavigation();
  const actionResponse = useActionData<typeof action>() as any;
  const submit = useSubmit();
  const isLoading =
    ["loading", "submitting"].includes(nav.state) && nav.formMethod === "POST";

  // parse the metafield data
  useEffect(() => {
    if (actionResponse && actionResponse?.reviews) {
      var parsedData = parseReviewData(actionResponse?.reviews);
      setReviewDetails(parsedData);
    } else if (actionResponse && actionResponse?.output) {
      console.log(actionResponse?.output);
      setQueryResponse(actionResponse?.output);
      setSqlQuery(actionResponse?.sqlQuery);
    }
  }, [actionResponse]);

  // trigger action to get reviews
  const getReviews = async (selectedProductId: Number) => {
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
    getReviews(Number(trimmed_id));
  };

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
                reviewDetails.length != 0 &&
                pushReviewsToDatabase(selectedProduct, reviewDetails)
              }
            >
              Add Reviews to Database
            </Button>
            <br /> { /* add new line */ }
            <input
              type="text"
              placeholder="Enter text"
              onChange={(e) => setQueryString(e.target.value)}
            />
            <Button
              onClick={() =>
                submit(
                  { apiQuery: "callAgent", agentQuery: queryString },
                  { replace: true, method: "POST" },
                )
              }
            >
              Call Agent
            </Button>
          </>
        }
      </Card>

      <Card>
        <input
          type="text"
          placeholder="chunk string"
          onChange={(e) => setChunkString(e.target.value)}
        />
        <Button
          onClick={() =>
            submit(
              { apiQuery: "chunkString", chunkString: chunkString },
              { replace: true, method: "POST" },
            )}  
        >
          Test Chunk String
        </Button>
      </Card>

      {queryResponse && (
        <Card>
          <p><strong>Input Query:</strong> {queryString}</p>
          <br /> { /* add new line */ }
          <p><strong>Agent Response:</strong> {queryResponse}</p>
          <br /> { /* add new line */ }
          <p><strong>SQL Query Used:</strong> {sqlQuery}</p>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <Spinner size="small" />
          <p>Loading...</p>
        </Card>
      ) : actionResponse?.reviews ? (
        <Card>
          <p>Reviews:</p>
          {reviewDetails.map((review, index) => (
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
