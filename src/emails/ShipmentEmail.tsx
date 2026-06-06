import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Preview,
} from "@react-email/components";
import * as React from "react";

interface ShipmentEmailProps {
  orderId: number;
  name?: string;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  items: { title: string; quantity: number }[];
  siteUrl: string;
}

export function ShipmentEmail({
  orderId,
  name,
  carrier,
  trackingNumber,
  trackingUrl,
  items,
  siteUrl,
}: ShipmentEmailProps) {
  const greeting = name ? `Hey ${name}! ✨` : "Great news, bestie! ✨";

  return (
    <Html lang="en">
      <Head />
      <Preview>Your Y2KASE order #{String(orderId)} is on its way 📦✨</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Text style={wordmarkStyle}>Y2KASE</Text>
            <Text style={taglineStyle}>your order is on its way</Text>
          </Section>

          <Section style={contentStyle}>
            <Text style={greetingStyle}>{greeting}</Text>
            <Text style={paraStyle}>
              Your order <strong>#{orderId}</strong> has shipped and is heading
              your way. 📦💕
            </Text>

            {(trackingNumber || trackingUrl) && (
              <Section style={trackBlockStyle}>
                {carrier && (
                  <Text style={trackLabelStyle}>Carrier: {carrier}</Text>
                )}
                {trackingNumber && (
                  <Text style={trackNumberStyle}>{trackingNumber}</Text>
                )}
                {trackingUrl && (
                  <Button href={trackingUrl} style={ctaStyle}>
                    Track your package
                  </Button>
                )}
              </Section>
            )}

            <Hr style={hrStyle} />

            <Text style={subheadStyle}>What&apos;s in this shipment</Text>
            {items.map((it, i) => (
              <Text key={i} style={itemStyle}>
                {it.quantity} × {it.title}
              </Text>
            ))}

            <Hr style={hrStyle} />

            <Text style={smallStyle}>
              Questions about your delivery? Just reply to this email or reach us
              at{" "}
              <a href="mailto:hello@y2kase.com" style={linkStyle}>
                hello@y2kase.com
              </a>
              .
            </Text>
            <Button href={`${siteUrl}/account/orders`} style={secondaryCtaStyle}>
              View your orders
            </Button>
          </Section>

          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              © {new Date().getFullYear()} Y2KASE · All rights reserved
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default ShipmentEmail;

// ── Styles (shared visual language with the other transactional emails) ───────

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#fdf3fb",
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  margin: 0,
  padding: "24px 0",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "560px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  borderRadius: "20px",
  border: "1px solid #f1d3ec",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  background: "linear-gradient(120deg,#ffc2ea 0%,#e6c5ff 33%,#c4e2ff 66%,#c4ffe8 100%)",
  padding: "36px 32px 28px",
  textAlign: "center",
};

const wordmarkStyle: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: "900",
  color: "#ff3ea5",
  letterSpacing: "0.06em",
  margin: 0,
  lineHeight: "1",
  textShadow: "-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff",
};

const taglineStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#34203b",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  margin: "6px 0 0",
  opacity: 0.7,
};

const contentStyle: React.CSSProperties = { padding: "36px 40px 28px" };

const greetingStyle: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: "800",
  color: "#34203b",
  margin: "0 0 16px",
};

const paraStyle: React.CSSProperties = {
  fontSize: "15px",
  color: "#34203b",
  lineHeight: "1.65",
  margin: "0 0 14px",
};

const trackBlockStyle: React.CSSProperties = {
  background: "#fdf3fb",
  border: "2px dashed #ff3ea5",
  borderRadius: "14px",
  padding: "20px",
  textAlign: "center",
  margin: "20px 0",
};

const trackLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#34203b",
  opacity: 0.6,
  margin: "0 0 6px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const trackNumberStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "800",
  color: "#34203b",
  letterSpacing: "0.04em",
  margin: "0 0 14px",
};

const subheadStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: "800",
  color: "#34203b",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  margin: "0 0 10px",
};

const itemStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#34203b",
  margin: "0 0 6px",
};

const ctaStyle: React.CSSProperties = {
  display: "block",
  background: "#ff3ea5",
  color: "#ffffff",
  fontWeight: "800",
  fontSize: "15px",
  textDecoration: "none",
  borderRadius: "9999px",
  padding: "13px 28px",
  textAlign: "center",
  margin: "0 auto",
  boxShadow: "0 4px 0 #d62f88",
};

const secondaryCtaStyle: React.CSSProperties = {
  display: "block",
  background: "#34203b",
  color: "#ffffff",
  fontWeight: "700",
  fontSize: "14px",
  textDecoration: "none",
  borderRadius: "9999px",
  padding: "12px 28px",
  textAlign: "center",
  margin: "8px auto 0",
};

const hrStyle: React.CSSProperties = {
  borderColor: "#f1d3ec",
  margin: "24px 0",
};

const smallStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#34203b",
  opacity: 0.65,
  lineHeight: "1.6",
  margin: "0 0 14px",
};

const linkStyle: React.CSSProperties = { color: "#ff3ea5", fontWeight: "700" };

const footerStyle: React.CSSProperties = {
  background: "#f7e7f6",
  padding: "16px 32px",
  textAlign: "center",
};

const footerTextStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#34203b",
  opacity: 0.5,
  margin: "0 0 4px",
};
