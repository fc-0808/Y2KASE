/**
 * Order confirmation email — branded Y2KASE receipt.
 *
 * Built with @react-email/components so it renders to bulletproof, table-based
 * HTML that survives Gmail / Outlook / Apple Mail. All styling is inline; no
 * external CSS or web fonts (email clients strip them).
 */
import {
  Body,
  Container,
  Column,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

export type OrderConfirmationItem = {
  title: string;
  imageUrl: string | null;
  options: Record<string, string> | null;
  quantity: number;
  unitCents: number;
};

export type OrderConfirmationProps = {
  orderId: number;
  currency: string;
  items: OrderConfirmationItem[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  shippingAddress: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  } | null;
  siteUrl: string;
};

const BRAND = {
  primary: "#ff3ea5",
  plum: "#34203b",
  bg: "#fdf3fb",
  card: "#ffffff",
  muted: "#f7e7f6",
  border: "#f1d3ec",
  subtle: "#8a7790",
};

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(cents / 100);
}

export function OrderConfirmation({
  orderId,
  currency,
  items,
  subtotalCents,
  shippingCents,
  totalCents,
  shippingAddress,
  siteUrl,
}: OrderConfirmationProps) {
  const base = siteUrl.replace(/\/$/, "");
  return (
    <Html>
      <Head />
      <Preview>Your Y2KASE order #{String(orderId)} is confirmed ✨</Preview>
      <Body
        style={{
          backgroundColor: BRAND.bg,
          margin: 0,
          padding: "24px 0",
          fontFamily:
            "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
          color: BRAND.plum,
        }}
      >
        <Container
          style={{
            width: "100%",
            maxWidth: "560px",
            margin: "0 auto",
            backgroundColor: BRAND.card,
            borderRadius: "20px",
            overflow: "hidden",
            border: `1px solid ${BRAND.border}`,
          }}
        >
          {/* Holographic accent bar */}
          <div
            style={{
              height: "6px",
              background:
                "linear-gradient(90deg,#ffc2ea 0%,#c9b4ff 35%,#9fe0ff 70%,#7fe3c4 100%)",
            }}
          />

          {/* Header */}
          <Section style={{ padding: "28px 32px 8px" }}>
            <Text
              style={{
                margin: 0,
                fontSize: "26px",
                fontWeight: 800,
                letterSpacing: "1px",
                color: BRAND.primary,
              }}
            >
              Y2KASE
            </Text>
          </Section>

          <Section style={{ padding: "0 32px" }}>
            <Heading
              as="h1"
              style={{ margin: "8px 0 4px", fontSize: "22px", fontWeight: 800 }}
            >
              Thank you, bestie! ✨
            </Heading>
            <Text style={{ margin: "0 0 4px", fontSize: "15px", color: BRAND.plum }}>
              Your payment went through and your order is confirmed. We&apos;ll
              email you again when it ships.
            </Text>
            <Text
              style={{
                margin: "0 0 8px",
                fontSize: "14px",
                fontWeight: 700,
                color: BRAND.primary,
              }}
            >
              Order #{orderId}
            </Text>
          </Section>

          <Hr style={{ borderColor: BRAND.border, margin: "16px 0" }} />

          {/* Items */}
          <Section style={{ padding: "0 32px" }}>
            {items.map((item, i) => {
              const optionLabel = item.options
                ? Object.entries(item.options)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")
                : "";
              return (
                <Row key={i} style={{ marginBottom: "14px" }}>
                  <Column style={{ width: "64px", verticalAlign: "top" }}>
                    {item.imageUrl ? (
                      <Img
                        src={item.imageUrl}
                        width="56"
                        height="56"
                        alt={item.title}
                        style={{
                          borderRadius: "12px",
                          objectFit: "cover",
                          backgroundColor: BRAND.muted,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "56px",
                          height: "56px",
                          borderRadius: "12px",
                          backgroundColor: BRAND.muted,
                        }}
                      />
                    )}
                  </Column>
                  <Column style={{ verticalAlign: "top", paddingLeft: "12px" }}>
                    <Text style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>
                      {item.title}
                    </Text>
                    {optionLabel && (
                      <Text
                        style={{
                          margin: "2px 0 0",
                          fontSize: "12px",
                          color: BRAND.subtle,
                        }}
                      >
                        {optionLabel}
                      </Text>
                    )}
                    <Text
                      style={{
                        margin: "2px 0 0",
                        fontSize: "12px",
                        color: BRAND.subtle,
                      }}
                    >
                      Qty {item.quantity}
                    </Text>
                  </Column>
                  <Column
                    style={{
                      verticalAlign: "top",
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Text style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>
                      {money(item.unitCents * item.quantity, currency)}
                    </Text>
                  </Column>
                </Row>
              );
            })}
          </Section>

          <Hr style={{ borderColor: BRAND.border, margin: "16px 0" }} />

          {/* Totals */}
          <Section style={{ padding: "0 32px" }}>
            <TotalRow label="Subtotal" value={money(subtotalCents, currency)} />
            <TotalRow
              label="Shipping"
              value={shippingCents === 0 ? "Free ✨" : money(shippingCents, currency)}
            />
            <Row>
              <Column>
                <Text style={{ margin: "6px 0 0", fontSize: "16px", fontWeight: 800 }}>
                  Total
                </Text>
              </Column>
              <Column style={{ textAlign: "right" }}>
                <Text style={{ margin: "6px 0 0", fontSize: "16px", fontWeight: 800 }}>
                  {money(totalCents, currency)}
                </Text>
              </Column>
            </Row>
          </Section>

          {shippingAddress && (
            <>
              <Hr style={{ borderColor: BRAND.border, margin: "16px 0" }} />
              <Section style={{ padding: "0 32px" }}>
                <Text
                  style={{
                    margin: "0 0 4px",
                    fontSize: "12px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: BRAND.subtle,
                  }}
                >
                  Shipping to
                </Text>
                <Text style={{ margin: 0, fontSize: "14px", lineHeight: "20px" }}>
                  {shippingAddress.name}
                  <br />
                  {shippingAddress.line1}
                  {shippingAddress.line2 ? (
                    <>
                      <br />
                      {shippingAddress.line2}
                    </>
                  ) : null}
                  <br />
                  {[
                    shippingAddress.city,
                    shippingAddress.state,
                    shippingAddress.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  <br />
                  {shippingAddress.country}
                </Text>
              </Section>
            </>
          )}

          {/* CTA */}
          <Section style={{ padding: "24px 32px 8px", textAlign: "center" }}>
            <Link
              href={`${base}/products`}
              style={{
                display: "inline-block",
                backgroundColor: BRAND.primary,
                color: "#ffffff",
                fontSize: "15px",
                fontWeight: 800,
                textDecoration: "none",
                padding: "12px 28px",
                borderRadius: "999px",
              }}
            >
              Keep shopping ✨
            </Link>
          </Section>

          <Hr style={{ borderColor: BRAND.border, margin: "20px 0 0" }} />

          {/* Footer */}
          <Section style={{ padding: "16px 32px 28px", textAlign: "center" }}>
            <Text style={{ margin: 0, fontSize: "12px", color: BRAND.subtle }}>
              Express your vibe 💕 Kawaii, Y2K &amp; holographic phone cases.
            </Text>
            <Text style={{ margin: "6px 0 0", fontSize: "12px", color: BRAND.subtle }}>
              <Link href={base} style={{ color: BRAND.primary, textDecoration: "none" }}>
                y2kase.com
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <Row>
      <Column>
        <Text style={{ margin: "2px 0", fontSize: "14px", color: "#8a7790" }}>
          {label}
        </Text>
      </Column>
      <Column style={{ textAlign: "right" }}>
        <Text style={{ margin: "2px 0", fontSize: "14px", fontWeight: 600 }}>
          {value}
        </Text>
      </Column>
    </Row>
  );
}

export default OrderConfirmation;
