import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Box,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query getCartSmartSettings {
      shop {
        name
        metafield(namespace: "cart_smart", key: "enable_free_gift") {
          value
        }
      }
    }
  `);

  const { data } = await response.json();
  return {
    shopName: data.shop.name,
    enabled: data.shop.metafield?.value === "true",
  };
};

export default function Index() {
  const { shopName, enabled } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="CartSmart" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingLg">
                      Welcome to CartSmart
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      {shopName}
                    </Text>
                  </BlockStack>
                  <Badge tone={enabled ? "success" : "attention"}>
                    {enabled ? "Active" : "Disabled"}
                  </Badge>
                </InlineStack>

                <Divider />

                <Text as="p" variant="bodyMd">
                  CartSmart adds a tiered rewards progress bar and free gift
                  system to your cart drawer — no theme code required. Use the
                  settings page to configure thresholds, choose gift products,
                  customise colours and labels.
                </Text>

                <InlineStack gap="300">
                  <Button url="/app/settings" variant="primary">
                    Configure Settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Quick Setup
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">
                      1. Go to <strong>Settings</strong> and enable the app
                    </Text>
                    <Text as="p" variant="bodyMd">
                      2. Set your free gift and free delivery thresholds
                    </Text>
                    <Text as="p" variant="bodyMd">
                      3. Select products to offer as free gifts
                    </Text>
                    <Text as="p" variant="bodyMd">
                      4. Add the CartSmart block to your theme via the Theme
                      Editor
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Features
                  </Text>
                  <BlockStack gap="100">
                    {[
                      "Tiered rewards progress bar",
                      "Free gift with purchase",
                      "Free delivery milestone",
                      "Best sellers upsell carousel",
                      "Fully customisable colours & labels",
                    ].map((feature) => (
                      <Box key={feature}>
                        <Text as="p" variant="bodyMd">
                          ✓ {feature}
                        </Text>
                      </Box>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
