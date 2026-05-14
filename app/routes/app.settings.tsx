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
  Button,
  Checkbox,
  Divider,
  Banner,
  Badge,
  Box,
  Thumbnail,
  Icon,
} from "@shopify/polaris";
import { XSmallIcon } from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

const NAMESPACE = "cart_smart";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Fetch metafields + resolve stored handles back to product/collection titles
  const response = await admin.graphql(`
    query getCartSmartSettings {
      shop {
        metafields(namespace: "cart_smart", first: 30) {
          edges { node { key value } }
        }
      }
    }
  `);

  const { data } = await response.json();
  const mf: Record<string, string> = {};
  for (const edge of data.shop.metafields.edges) {
    mf[edge.node.key] = edge.node.value;
  }

  // Resolve stored gift product handles → titles + images
  const giftHandles: string[] = mf.free_gift_products
    ? mf.free_gift_products.split(",").map((h: string) => h.trim()).filter(Boolean)
    : [];

  let giftProducts: { id: string; handle: string; title: string; image: string | null }[] = [];

  if (giftHandles.length > 0) {
    const productQuery = giftHandles
      .map((h, i) => `p${i}: productByHandle(handle: ${JSON.stringify(h)}) { id handle title featuredImage { url } }`)
      .join("\n");

    const productRes = await admin.graphql(`query { ${productQuery} }`);
    const productData = await productRes.json();

    giftProducts = giftHandles.map((handle, i) => {
      const p = productData.data[`p${i}`];
      return p
        ? { id: p.id, handle: p.handle, title: p.title, image: p.featuredImage?.url ?? null }
        : { id: handle, handle, title: handle, image: null };
    });
  }

  // Resolve stored upsell collection handle → title
  const upsellHandle = mf.upsell_collection ?? "";
  let upsellCollection: { id: string; handle: string; title: string } | null = null;

  if (upsellHandle) {
    const colRes = await admin.graphql(`
      query { collectionByHandle(handle: ${JSON.stringify(upsellHandle)}) { id handle title } }
    `);
    const colData = await colRes.json();
    if (colData.data.collectionByHandle) {
      upsellCollection = colData.data.collectionByHandle;
    }
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
      free_gift_products: mf.free_gift_products ?? "",
      upsell_collection: upsellHandle,
    },
    giftProducts,
    upsellCollection,
  });
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const keys = [
    "enable_free_gift", "free_gift_threshold", "free_shipping_threshold",
    "accent_color", "progress_bg_color", "gift_selected_label", "gift_choose_cta",
    "gift_swap_label", "free_gift_discount_code", "loyalty_points_per_pound",
    "empty_title", "empty_cta", "subtotal_label", "continue_cta", "banner_text",
    "free_gift_products", "upsell_collection",
  ];

  const metafields = keys.map((key) => {
    let value: string;
    if (key === "enable_free_gift") {
      value = formData.has("enable_free_gift") ? "true" : "false";
    } else {
      value = (formData.get(key) as string) ?? "";
    }
    return { namespace: NAMESPACE, key, value, type: "single_line_text_field" };
  });

  const response = await admin.graphql(
    `#graphql
    mutation setMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { key value }
        userErrors { field message }
      }
    }`,
    { variables: { metafields } }
  );

  const { data } = await response.json();
  const errors = data.metafieldsSet.userErrors;
  if (errors.length > 0) return json({ success: false, errors }, { status: 422 });
  return json({ success: true, errors: [] });
};

// ─── Types ────────────────────────────────────────────────────────────────────

type GiftProduct = { id: string; handle: string; title: string; image: string | null };
type UpsellCollection = { id: string; handle: string; title: string } | null;

// ─── Component ───────────────────────────────────────────────────────────────

export default function Settings() {
  const { settings, giftProducts: initialGiftProducts, upsellCollection: initialUpsellCollection } =
    useLoaderData<typeof loader>();

  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSaving = navigation.state === "submitting";

  const [form, setForm] = useState({ ...settings });
  const [giftProducts, setGiftProducts] = useState<GiftProduct[]>(initialGiftProducts);
  const [upsellCollection, setUpsellCollection] = useState<UpsellCollection>(initialUpsellCollection);
  const [saved, setSaved] = useState(false);

  const set = useCallback(
    (key: keyof typeof form) => (value: string | boolean) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setSaved(false);
    },
    []
  );

  // ─── Gift product picker ──────────────────────────────────────────────────

  const openGiftProductPicker = useCallback(async () => {
    const selected = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      selectionIds: giftProducts.map((p) => ({ id: p.id })),
    });

    if (!selected) return;

    const picked: GiftProduct[] = selected.map((p: any) => ({
      id: p.id,
      handle: p.handle,
      title: p.title,
      image: p.images?.[0]?.originalSrc ?? null,
    }));

    setGiftProducts(picked);
    setForm((prev) => ({
      ...prev,
      free_gift_products: picked.map((p) => p.handle).join(","),
    }));
    setSaved(false);
  }, [shopify, giftProducts]);

  const removeGiftProduct = useCallback((handle: string) => {
    setGiftProducts((prev) => {
      const next = prev.filter((p) => p.handle !== handle);
      setForm((f) => ({ ...f, free_gift_products: next.map((p) => p.handle).join(",") }));
      return next;
    });
    setSaved(false);
  }, []);

  // ─── Upsell collection picker ─────────────────────────────────────────────

  const openCollectionPicker = useCallback(async () => {
    const selected = await shopify.resourcePicker({
      type: "collection",
      multiple: false,
      selectionIds: upsellCollection ? [{ id: upsellCollection.id }] : [],
    });

    if (!selected || selected.length === 0) return;

    const col = selected[0];
    const picked: UpsellCollection = { id: col.id, handle: col.handle, title: col.title };
    setUpsellCollection(picked);
    setForm((prev) => ({ ...prev, upsell_collection: picked!.handle }));
    setSaved(false);
  }, [shopify, upsellCollection]);

  const removeCollection = useCallback(() => {
    setUpsellCollection(null);
    setForm((prev) => ({ ...prev, upsell_collection: "" }));
    setSaved(false);
  }, []);

  // ─── Submit ───────────────────────────────────────────────────────────────

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
        <Button variant="primary" onClick={handleSubmit} loading={isSaving}>
          Save Settings
        </Button>
      }
    >
      <TitleBar title="Settings" />
      <BlockStack gap="500">
        {saved && !isSaving && <Banner tone="success">Settings saved successfully.</Banner>}

        {/* ─── Free Gift ─── */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Free Gift System</Text>
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
                      helpText="Cart value to unlock the free gift"
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
                      helpText="Cart value for free delivery milestone"
                    />
                  </Box>
                </InlineStack>

                {/* Gift products */}
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">Gift Products</Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Customers choose one of these when they unlock the free gift.
                  </Text>

                  {giftProducts.length > 0 && (
                    <BlockStack gap="200">
                      {giftProducts.map((p) => (
                        <Box
                          key={p.handle}
                          padding="300"
                          background="bg-surface-secondary"
                          borderRadius="200"
                        >
                          <InlineStack align="space-between" blockAlign="center" gap="300">
                            <InlineStack gap="300" blockAlign="center">
                              <Thumbnail
                                source={p.image ?? ""}
                                alt={p.title}
                                size="small"
                              />
                              <Text as="p" variant="bodyMd">{p.title}</Text>
                            </InlineStack>
                            <Button
                              variant="plain"
                              tone="critical"
                              icon={XSmallIcon}
                              onClick={() => removeGiftProduct(p.handle)}
                              accessibilityLabel={`Remove ${p.title}`}
                            />
                          </InlineStack>
                        </Box>
                      ))}
                    </BlockStack>
                  )}

                  <Button onClick={openGiftProductPicker}>
                    {giftProducts.length > 0 ? "Edit gift products" : "Select gift products"}
                  </Button>
                </BlockStack>

                <TextField
                  label="Free gift discount code"
                  value={form.free_gift_discount_code}
                  onChange={set("free_gift_discount_code")}
                  autoComplete="off"
                  helpText="Optional — Shopify discount code applied when the free gift is added to cart"
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* ─── Upsell ─── */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Best Sellers Carousel</Text>
                <Divider />
                <Text as="p" variant="bodyMd" tone="subdued">
                  Products from this collection appear in the upsell carousel at the bottom of the cart.
                </Text>

                {upsellCollection && (
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="p" variant="bodyMd">{upsellCollection.title}</Text>
                      <Button
                        variant="plain"
                        tone="critical"
                        icon={XSmallIcon}
                        onClick={removeCollection}
                        accessibilityLabel="Remove collection"
                      />
                    </InlineStack>
                  </Box>
                )}

                <Button onClick={openCollectionPicker}>
                  {upsellCollection ? "Change collection" : "Select collection"}
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* ─── Appearance ─── */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Appearance</Text>
                <Divider />
                <InlineStack gap="400">
                  <Box minWidth="200px">
                    <TextField
                      label="Accent colour"
                      value={form.accent_color}
                      onChange={set("accent_color")}
                      autoComplete="off"
                      helpText="Progress bar, milestones, CTA button — hex value"
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
                <Text as="h2" variant="headingMd">Labels & Text</Text>
                <Divider />
                <TextField
                  label="Top banner text"
                  value={form.banner_text}
                  onChange={set("banner_text")}
                  autoComplete="off"
                />
                <InlineStack gap="400">
                  <Box minWidth="200px">
                    <TextField
                      label="Gift CTA button"
                      value={form.gift_choose_cta}
                      onChange={set("gift_choose_cta")}
                      autoComplete="off"
                    />
                  </Box>
                  <Box minWidth="200px">
                    <TextField
                      label="Swap gift button"
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
                <Text as="h2" variant="headingMd">Advanced</Text>
                <Divider />
                <Box minWidth="200px">
                  <TextField
                    label="Loyalty points per £1 spent"
                    value={form.loyalty_points_per_pound}
                    onChange={set("loyalty_points_per_pound")}
                    type="number"
                    autoComplete="off"
                    helpText="Shown in the cart loyalty callout"
                  />
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
