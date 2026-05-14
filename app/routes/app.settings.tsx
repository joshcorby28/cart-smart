import { useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Select,
  Button,
  Checkbox,
  Divider,
  Banner,
  Badge,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

// ─── Metafield keys ───────────────────────────────────────────────────────────

const NAMESPACE = "cart_smart";

const KEYS = {
  enable_free_gift: "enable_free_gift",
  free_gift_threshold: "free_gift_threshold",
  free_shipping_threshold: "free_shipping_threshold",
  accent_color: "accent_color",
  progress_bg_color: "progress_bg_color",
  gift_selected_label: "gift_selected_label",
  gift_choose_cta: "gift_choose_cta",
  gift_swap_label: "gift_swap_label",
  free_gift_discount_code: "free_gift_discount_code",
  loyalty_points_per_pound: "loyalty_points_per_pound",
  empty_title: "empty_title",
  empty_cta: "empty_cta",
  subtotal_label: "subtotal_label",
  continue_cta: "continue_cta",
  banner_text: "banner_text",
} as const;

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query getCartSmartSettings {
      shop {
        metafields(namespace: "cart_smart", first: 30) {
          edges {
            node {
              key
              value
            }
          }
        }
      }
    }
  `);

  const { data } = await response.json();
  const mf: Record<string, string> = {};
  for (const edge of data.shop.metafields.edges) {
    mf[edge.node.key] = edge.node.value;
  }

  return json({
    settings: {
      enable_free_gift: mf.enable_free_gift === "true",
      free_gift_threshold: mf.free_gift_threshold ?? "60",
      free_shipping_threshold: mf.free_shipping_threshold ?? "40",
      accent_color: mf.accent_color ?? "#f18a02",
      progress_bg_color: mf.progress_bg_color ?? "#e9e9e9",
      gift_selected_label: mf.gift_selected_label ?? "Your free gift",
      gift_choose_cta: mf.gift_choose_cta ?? "CHOOSE GIFT",
      gift_swap_label: mf.gift_swap_label ?? "SWAP",
      free_gift_discount_code: mf.free_gift_discount_code ?? "",
      loyalty_points_per_pound: mf.loyalty_points_per_pound ?? "10",
      empty_title: mf.empty_title ?? "Your cart is empty",
      empty_cta: mf.empty_cta ?? "Continue Shopping",
      subtotal_label: mf.subtotal_label ?? "Subtotal",
      continue_cta: mf.continue_cta ?? "Continue Shopping",
      banner_text: mf.banner_text ?? "EARN POINTS & REWARDS AS YOU SHOP",
    },
  });
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const metafields = Object.entries(KEYS).map(([key]) => {
    let value = formData.get(key) as string;
    // Checkboxes submit "on" when checked, absent when unchecked
    if (key === "enable_free_gift") {
      value = formData.has("enable_free_gift") ? "true" : "false";
    }
    return {
      namespace: NAMESPACE,
      key,
      value: value ?? "",
      type: "single_line_text_field",
    };
  });

  const response = await admin.graphql(
    `#graphql
    mutation setMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }`,
    { variables: { metafields } }
  );

  const { data } = await response.json();
  const errors = data.metafieldsSet.userErrors;

  if (errors.length > 0) {
    return json({ success: false, errors }, { status: 422 });
  }

  return json({ success: true, errors: [] });
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [form, setForm] = useState({ ...settings });
  const [saved, setSaved] = useState(false);

  const set = useCallback(
    (key: keyof typeof form) => (value: string | boolean) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setSaved(false);
    },
    []
  );

  const handleSubmit = () => {
    const data = new FormData();
    for (const [key, value] of Object.entries(form)) {
      if (typeof value === "boolean") {
        if (value) data.set(key, "on");
      } else {
        data.set(key, value);
      }
    }
    submit(data, { method: "POST" });
    setSaved(true);
  };

  return (
    <Page
      backAction={{ url: "/app" }}
      title="CartSmart Settings"
      primaryAction={
        <Button
          variant="primary"
          onClick={handleSubmit}
          loading={isSaving}
        >
          Save Settings
        </Button>
      }
    >
      <TitleBar title="Settings" />
      <BlockStack gap="500">
        {saved && !isSaving && (
          <Banner tone="success">Settings saved successfully.</Banner>
        )}

        {/* ─── Free Gift ─── */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Free Gift System
                  </Text>
                  <Badge tone={form.enable_free_gift ? "success" : "attention"}>
                    {form.enable_free_gift ? "Enabled" : "Disabled"}
                  </Badge>
                </InlineStack>
                <Divider />
                <Checkbox
                  label="Enable free gift rewards"
                  checked={form.enable_free_gift}
                  onChange={set("enable_free_gift")}
                />
                <InlineStack gap="400">
                  <Box minWidth="200px">
                    <TextField
                      label="Free gift threshold (£)"
                      value={form.free_gift_threshold}
                      onChange={set("free_gift_threshold")}
                      type="number"
                      prefix="£"
                      autoComplete="off"
                      helpText="Cart value needed to unlock the free gift"
                    />
                  </Box>
                  <Box minWidth="200px">
                    <TextField
                      label="Free delivery threshold (£)"
                      value={form.free_shipping_threshold}
                      onChange={set("free_shipping_threshold")}
                      type="number"
                      prefix="£"
                      autoComplete="off"
                      helpText="Cart value needed for free delivery"
                    />
                  </Box>
                </InlineStack>
                <TextField
                  label="Free gift discount code"
                  value={form.free_gift_discount_code}
                  onChange={set("free_gift_discount_code")}
                  autoComplete="off"
                  helpText="Optional Shopify discount code applied when the free gift is added"
                />
                <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Gift Products
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      To set gift products, go to{" "}
                      <strong>
                        Shopify Admin → Content → Metafields → Shop
                      </strong>{" "}
                      and set the{" "}
                      <code>cart_smart.free_gift_products</code> metafield to a{" "}
                      <strong>list of product references</strong>. A visual
                      product picker will be added in a future release.
                    </Text>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* ─── Appearance ─── */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Appearance
                </Text>
                <Divider />
                <InlineStack gap="400">
                  <Box minWidth="200px">
                    <TextField
                      label="Accent colour"
                      value={form.accent_color}
                      onChange={set("accent_color")}
                      autoComplete="off"
                      helpText="Progress bar fill, milestone icons, CTA button — hex or CSS colour"
                    />
                  </Box>
                  <Box minWidth="200px">
                    <TextField
                      label="Progress bar background"
                      value={form.progress_bg_color}
                      onChange={set("progress_bg_color")}
                      autoComplete="off"
                    />
                  </Box>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* ─── Labels ─── */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Labels & Text
                </Text>
                <Divider />
                <InlineStack gap="400">
                  <Box minWidth="200px">
                    <TextField
                      label="Gift CTA button text"
                      value={form.gift_choose_cta}
                      onChange={set("gift_choose_cta")}
                      autoComplete="off"
                    />
                  </Box>
                  <Box minWidth="200px">
                    <TextField
                      label="Swap gift button text"
                      value={form.gift_swap_label}
                      onChange={set("gift_swap_label")}
                      autoComplete="off"
                    />
                  </Box>
                  <Box minWidth="200px">
                    <TextField
                      label="Selected gift label"
                      value={form.gift_selected_label}
                      onChange={set("gift_selected_label")}
                      autoComplete="off"
                    />
                  </Box>
                </InlineStack>
                <TextField
                  label="Top banner text"
                  value={form.banner_text}
                  onChange={set("banner_text")}
                  autoComplete="off"
                />
                <InlineStack gap="400">
                  <Box minWidth="200px">
                    <TextField
                      label="Empty cart title"
                      value={form.empty_title}
                      onChange={set("empty_title")}
                      autoComplete="off"
                    />
                  </Box>
                  <Box minWidth="200px">
                    <TextField
                      label="Empty cart CTA"
                      value={form.empty_cta}
                      onChange={set("empty_cta")}
                      autoComplete="off"
                    />
                  </Box>
                </InlineStack>
                <InlineStack gap="400">
                  <Box minWidth="200px">
                    <TextField
                      label="Subtotal label"
                      value={form.subtotal_label}
                      onChange={set("subtotal_label")}
                      autoComplete="off"
                    />
                  </Box>
                  <Box minWidth="200px">
                    <TextField
                      label="Continue shopping button"
                      value={form.continue_cta}
                      onChange={set("continue_cta")}
                      autoComplete="off"
                    />
                  </Box>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* ─── Advanced ─── */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Advanced
                </Text>
                <Divider />
                <Box minWidth="200px">
                  <TextField
                    label="Loyalty points per pound"
                    value={form.loyalty_points_per_pound}
                    onChange={set("loyalty_points_per_pound")}
                    type="number"
                    autoComplete="off"
                    helpText="Points awarded per £1 spent (shown in cart)"
                  />
                </Box>
                <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Upsell Collection
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      To set the Best Sellers upsell carousel, go to{" "}
                      <strong>Shopify Admin → Content → Metafields → Shop</strong>{" "}
                      and set <code>cart_smart.upsell_collection</code> to a{" "}
                      <strong>collection reference</strong>.
                    </Text>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Box paddingBlockEnd="400" />
      </BlockStack>
    </Page>
  );
}
