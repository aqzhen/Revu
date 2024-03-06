import { json } from "@remix-run/node";

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
