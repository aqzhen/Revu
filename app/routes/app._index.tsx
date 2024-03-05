import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  console.log("Loading products");

  const response = await admin.graphql(
    `#graphql
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
    `,
  );
  const responseJson = await response.json();

  return json({
    products: responseJson.data?.products?.edges,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  var productId = formData.get("productId") as string;
  console.log(productId);

  const response = await admin.graphql(
    `#graphql
    query($productId: ID!) {
      product(id: $productId) {
        id
        metafield(namespace: "judgeme", key: "widget") {
          value
        }
      }
    }
    `,
    {
      variables: {
        productId: "gid://shopify/Product/" + productId,
      },
    },
  );
  const responseJson = await response.json();
  console.log(responseJson);

  return json({
    metafield: responseJson.data?.product?.metafield?.value,
  });
};

export default function Index() {
  const [products, setProducts] = useState<any[]>([]);
  var [selectedProduct, setSelectedProduct] = useState(null);

  // get metafield data
  const nav = useNavigation();
  const metafieldData = useActionData<typeof action>();
  const submit = useSubmit();
  const isLoading =
    ["loading", "submitting"].includes(nav.state) && nav.formMethod === "POST";

  // parse the metafield data

  // get products data on load
  const productsData = useLoaderData<typeof loader>();

  useEffect(() => {
    setProducts(
      productsData.products.map((edge: any) => ({
        id: edge?.node?.id,
        title: edge?.node?.title,
        imageUrl: edge?.node?.images?.edges?.[0]?.node?.url,
      })),
    );
  }, []);

  // trigger action to get metafield
  const getMetafield = async (selectedProductId: any) => {
    await submit(
      { productId: Number(selectedProductId) },
      { replace: true, method: "POST" },
    );
  };

  // set selected product
  const handleProductSelection = async (productId: any) => {
    var trimmed_id = productId.replace("gid://shopify/Product/", "");
    setSelectedProduct(trimmed_id);
    getMetafield(trimmed_id);
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
      </Card>

      {isLoading ? (
        <Card>
          <Spinner size="small" />
          <p>Loading...</p>
        </Card>
      ) : metafieldData?.metafield ? (
        <Card>
          <p>{metafieldData.metafield}</p>
        </Card>
      ) : null}
    </Page>
  );
}
