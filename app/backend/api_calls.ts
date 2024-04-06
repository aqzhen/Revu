import { json } from "@remix-run/node";
import { Review } from "~/globals";

export async function getProducts(admin: any) {
  const response = await admin.graphql(`
      #graphq
      query {
        products(first: 20) {
          edges {
            node {
              id
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

  return json({ products: responseJson.data?.products?.edges });
}

export async function fetchJudgeReviews(productId: string) {
  const judgeApiKey = process.env.JUDGE_API_KEY;
  const shopDomain = process.env.SHOPIFY_DOMAIN;

  const response = await fetch(
    `https://judge.me/api/v1/reviews?external_id=${productId}&api_token=${judgeApiKey}&shop_domain=${shopDomain}&per_page=15`,
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

export async function getCustomerProductPurchases(
  customerId: number,
  admin: any,
) {
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

// const fetchMetafieldReviews = async (productId: string) => {
//     const response = await admin.graphql(
//       `#graphql
//       query($productId: ID!) {
//         product(id: $productId) {
//           id
//           metafield(namespace: "judgeme", key: "widget") {
//             value
//           }
//         }
//       }
//       `,
//       {
//         variables: {
//           productId: "gid://shopify/Product/" + productId,
//         },
//       },
//     );
//     return response.product.metafield.value;
//   };

// export async function fetchReviews(selectedProductId: Number) {
//   const requestData = {
//     productId: selectedProductId,
//   };
//   try {
//     const response = await fetch("/reviews/fetchAll", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify(requestData),
//     });

//     const data = await response.json();
//     console.log("HIIIII" + data);
//     return data;
//   } catch (error) {
//     // Handle any errors
//     console.error(error);
//   }
// }

// export async function pushReviewsToDatabase(
//   productId: number,
//   reviews: Review[],
// ) {
//   const requestData = {
//     productId: productId,
//     reviews: reviews,
//   };
//   try {
//     const response = await fetch("/reviews/pushToDatabase", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify(requestData),
//     });
//   } catch (error) {
//     // Handle any errors
//     console.error(error);
//   }
// }

// export async function getReviews(reviewIds: number[], chunkNumbers: number[]) {
//   const requestData = {
//     reviewIds: reviewIds,
//     chunkNumbers: chunkNumbers,
//   };
//   try {
//     const response = await fetch("/reviews/getChunks", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify(requestData),
//     });

//     const data = await response.json();

//     return data;
//   } catch (error) {
//     // Handle any errors
//     console.error(error);
//   }
// }

// export async function getQueries(queryIds: number[]) {
//   const requestData = {
//     queryIds: queryIds,
//   };
//   try {
//     const response = await fetch("/queries/getReturnedQueries", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify(requestData),
//     });

//     const data = await response.json();

//     return data;
//   } catch (error) {
//     // Handle any errors
//     console.error(error);
//   }
// }

// export async function getReviewPromptData() {
//   try {
//     const response = await fetch("/prompts/getReviewPromptData", {
//       method: "GET",
//       headers: {
//         "Content-Type": "application/json",
//       },
//     });

//     const data = await response.json();

//     return data;
//   } catch (error) {
//     // Handle any errors
//     console.error(error);
//   }
// }

// export async function callAgent(
//   agentQuery: string,
//   userMode: any,
//   tableToQuery: string,
// ) {
//   const requestData = {
//     agentQuery: agentQuery,
//     userMode: userMode,
//     tableToQuery: tableToQuery,
//   };
//   try {
//     const response = await fetch("/agent", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify(requestData),
//     });

//     const data = await response.json();

//     return data;
//   } catch (error) {
//     // Handle any errors
//     console.error(error);
//   }
// }
