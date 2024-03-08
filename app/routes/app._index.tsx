import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  useActionData,
  useNavigation,
  useSubmit,
  useLoaderData,
  json,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  DataTable,
  Spinner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { parseReviewData } from "./metafield_parsers/judge";
import { getProducts, fetchJudgeReviews } from "./backend/api_calls";
// import { addReviewsToDatabase } from "./backend/prisma/helpers";
import {
  connectToSingleStore,
  createReviewTable,
  createQueriesTable,
  addReviewsToSingleStore,
} from "./backend/vectordb/helpers";
import { initialize_agent, call_agent } from "./backend/langchain/agent";
import { Review } from "../globals";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  console.log("Connecting to SingleStore");
  const db = await connectToSingleStore();
  createReviewTable(false);
  createQueriesTable(true);

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

  console.log(productId);

  if (apiQuery === "fetchJudgeReviews") {
    return fetchJudgeReviews(productId);
  } else if (apiQuery === "addReviewsToDatabase") {
    addReviewsToSingleStore(Number(productId), JSON.parse(reviews || "[]"));
    return null;
  } else if (apiQuery === "callAgent") {
    return call_agent(agentQuery);
  }
};

export default function Index() {
  const [products, setProducts] = useState<any[]>([]);
  var [selectedProduct, setSelectedProduct] = useState<number>();
  var [reviewDetails, setReviewDetails] = useState<Review[]>([]);
  var [queryString, setQueryString] = useState<string>("");
  var [queryResponse, setQueryResponse] = useState<undefined>();

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
    } else if (actionResponse && actionResponse?.result) {
      console.log(actionResponse?.result);
      setQueryResponse(actionResponse?.result);
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

      {queryResponse && (
        <Card>
          <p>Agent Response: {queryResponse}</p>
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
