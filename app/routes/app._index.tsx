import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  useActionData,
  useNavigation,
  useSubmit,
  useLoaderData,
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
import { addReviewsToDatabase } from "./backend/prisma/helpers";
import { Review } from "../globals";
import { log } from "console";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  console.log("Loading products");
  return getProducts(admin);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  var apiQuery = formData.get("apiQuery") as string;
  var productId = formData.get("productId") as string;
  var reviews = formData.get("reviews") as string;

  console.log(productId);

  if (apiQuery === "fetchJudgeReviews") {
    return fetchJudgeReviews(productId);
  } else if (apiQuery === "addReviewsToDatabase") {
    addReviewsToDatabase(Number(productId), JSON.parse(reviews || "[]"));
    return null;
  }
};

export default function Index() {
  const [products, setProducts] = useState<any[]>([]);
  var [selectedProduct, setSelectedProduct] = useState<number>();
  var [reviewDetails, setReviewDetails] = useState<Review[]>([]);

  // get metafield data
  const nav = useNavigation();
  const reviewData = useActionData<typeof action>();
  const submit = useSubmit();
  const isLoading =
    ["loading", "submitting"].includes(nav.state) && nav.formMethod === "POST";

  // parse the metafield data
  useEffect(() => {
    if (reviewData && reviewData?.reviews) {
      var parsedData = parseReviewData(reviewData?.reviews);
      setReviewDetails(parsedData);
    }
  }, [reviewData]);

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
          <Button
            onClick={() =>
              selectedProduct &&
              reviewDetails.length != 0 &&
              pushReviewsToDatabase(selectedProduct, reviewDetails)
            }
          >
            Add Reviews to Database
          </Button>
        }
      </Card>

      {isLoading ? (
        <Card>
          <Spinner size="small" />
          <p>Loading...</p>
        </Card>
      ) : reviewData?.reviews ? (
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
