import { json } from "@remix-run/node";
import { insertProduct } from "./vectordb/helpers";

export async function getProducts() {
  const response = await admin.graphql(`
      #graphq
      query {
        products(first: 20) {
          edges {
            node {
              id
              description
              title
              images (first: 1) {
                edges {
                  node {
                    url
                  }
                }
              }
            }
          }
        }
      }
    `);
  if (!response.ok) {
    // Handle error if response is not ok
    throw new Error("Failed to fetch products");
  }
  const responseJson = await response.json();
  const productData = responseJson.data?.products?.edges;  
  console.log(productData);
  productData.map(async (edge: any) => {
    let id : number = Number(edge?.node?.id.replace("gid://shopify/Product/", ""))
    await insertProduct(id, edge?.node?.title, edge?.node?.description);
  })

  return json({ products: responseJson.data?.products?.edges });
}

export async function fetchJudgeReviews() {
  const judgeApiKey = process.env.JUDGE_API_KEY;
  const shopDomain = process.env.SHOPIFY_DOMAIN;

  const response = await fetch(
    `https://judge.me/api/v1/reviews?api_token=${judgeApiKey}&shop_domain=${shopDomain}&per_page=100`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    // Handle error if response is not ok
    throw new Error("Failed to fetch reviews");
  }

  const responseJson = await response.json();

  return json({
    reviews: responseJson.reviews,
  });
}

export async function fetchJudgeReview(reviewId: string) {
  const judgeApiKey = process.env.JUDGE_API_KEY;
  const shopDomain = process.env.SHOPIFY_DOMAIN;

  const response = await fetch(
    `https://judge.me/api/v1/reviews/${reviewId}?api_token=${judgeApiKey}&shop_domain=${shopDomain}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    // Handle error if response is not ok
    throw new Error("Failed to fetch reviews");
  }

  const responseJson = await response.json();

  return json({
    review: responseJson.review,
  });
}

export async function getCustomerProductPurchases(customerId: number) {
  const response = await admin.graphql(`
    query {
      customer(id: "gid://shopify/Customer/${customerId}") {
        orders (first:10) {
          edges {
            node {
              lineItems (first:10) {
                edges {
                  node {
                    product {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `);
  if (!response.ok) {
    // Handle error if response is not ok
    throw new Error("Failed to fetch products");
  }
  const responseJson = await response.json();

  const productIds: number[] =
    responseJson.data?.customer?.orders?.edges?.flatMap((edge: any) =>
      edge.node.lineItems.edges.map((item: any) =>
        Number(item.node.product.id.replace("gid://shopify/Product/", "")),
      ),
    );
  return json({ productIds: productIds });
}

export async function getProductDescription(productId: number) {
  const response = await admin.graphql(`
    query {
      product(id: "gid://shopify/Product/${productId}") {
        description
      }
    }
  `);
  if (!response.ok) {
    // Handle error if response is not ok
    throw new Error("Failed to fetch product description");
  }
  const responseJson = await response.json();

  return ({ description: responseJson.data?.product?.description });
}
