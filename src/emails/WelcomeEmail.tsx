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

interface WelcomeEmailProps {
  name?: string;
  code: string;
  /** Signed one-click unsubscribe link (marketing email requirement). */
  unsubscribeUrl?: string;
}

export function WelcomeEmail({ name, code, unsubscribeUrl }: WelcomeEmailProps) {
  const greeting = name ? `Hey ${name}! ✨` : "Welcome, bestie! ✨";

  return (
    <Html lang="en">
      <Head />
      <Preview>Your 10% off code is ready — shop Y2KASE now ✨</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerStyle}>
            <Text style={wordmarkStyle}>Y2KASE</Text>
            <Text style={taglineStyle}>kawaii · y2k · holographic</Text>
          </Section>

          {/* Body */}
          <Section style={contentStyle}>
            <Text style={greetingStyle}>{greeting}</Text>
            <Text style={paraStyle}>
              You&apos;re officially part of the Y2KASE Club — the home of
              kawaii phone cases, holographic charms, and all the Y2K energy
              your phone deserves. 🌸✨
            </Text>
            <Text style={paraStyle}>
              As a thank-you for joining, here&apos;s your exclusive{" "}
              <strong>10% off your first order</strong>:
            </Text>

            {/* Promo code block */}
            <Section style={codeBlockStyle}>
              <Text style={codeStyle}>{code}</Text>
              <Text style={codeSubStyle}>Enter at checkout · One use · No minimum</Text>
            </Section>

            <Button href="https://y2kase.com/products" style={ctaStyle}>
              Shop the Collection ✨
            </Button>

            <Hr style={hrStyle} />

            <Text style={smallStyle}>
              💌 You&apos;ll only hear from us when there&apos;s something good —
              new drops, exclusive deals, and kawaii goodness. No spam, we
              promise.
            </Text>
            <Text style={smallStyle}>
              Questions? Email us at{" "}
              <a href="mailto:hello@y2kase.com" style={linkStyle}>
                hello@y2kase.com
              </a>
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              © {new Date().getFullYear()} Y2KASE · All rights reserved
            </Text>
            <Text style={footerTextStyle}>
              <a href="https://y2kase.com/policies/privacy-policy" style={footerLinkStyle}>
                Privacy Policy
              </a>{" "}
              ·{" "}
              <a href="https://y2kase.com/policies/refund-policy" style={footerLinkStyle}>
                Refund Policy
              </a>
              {unsubscribeUrl ? (
                <>
                  {" "}
                  ·{" "}
                  <a href={unsubscribeUrl} style={footerLinkStyle}>
                    Unsubscribe
                  </a>
                </>
              ) : null}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default WelcomeEmail;

// ── Styles ────────────────────────────────────────────────────────────────────

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

const contentStyle: React.CSSProperties = {
  padding: "36px 40px 28px",
};

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

const codeBlockStyle: React.CSSProperties = {
  background: "#fdf3fb",
  border: "2px dashed #ff3ea5",
  borderRadius: "14px",
  padding: "20px",
  textAlign: "center",
  margin: "24px 0",
};

const codeStyle: React.CSSProperties = {
  fontSize: "30px",
  fontWeight: "900",
  color: "#ff3ea5",
  letterSpacing: "0.1em",
  margin: 0,
  lineHeight: "1",
};

const codeSubStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#34203b",
  opacity: 0.6,
  margin: "8px 0 0",
};

const ctaStyle: React.CSSProperties = {
  display: "block",
  background: "#ff3ea5",
  color: "#ffffff",
  fontWeight: "800",
  fontSize: "15px",
  textDecoration: "none",
  borderRadius: "9999px",
  padding: "14px 32px",
  textAlign: "center",
  margin: "0 auto 28px",
  boxShadow: "0 4px 0 #d62f88",
};

const hrStyle: React.CSSProperties = {
  borderColor: "#f1d3ec",
  margin: "0 0 24px",
};

const smallStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#34203b",
  opacity: 0.65,
  lineHeight: "1.6",
  margin: "0 0 10px",
};

const linkStyle: React.CSSProperties = {
  color: "#ff3ea5",
  fontWeight: "700",
};

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

const footerLinkStyle: React.CSSProperties = {
  color: "#34203b",
  opacity: 0.6,
};
