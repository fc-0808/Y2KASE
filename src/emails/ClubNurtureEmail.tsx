import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Img,
  Preview,
} from "@react-email/components";
import * as React from "react";

export type ClubNurtureProduct = {
  title: string;
  imageUrl: string;
  href: string;
};

interface ClubNurtureEmailProps {
  name?: string;
  step: 2 | 3;
  code?: string;
  percentOff?: number;
  products: ClubNurtureProduct[];
  shopUrl: string;
  unsubscribeUrl?: string;
  postalAddress: string;
}

export function ClubNurtureEmail({
  name,
  step,
  code,
  percentOff,
  products,
  shopUrl,
  unsubscribeUrl,
  postalAddress,
}: ClubNurtureEmailProps) {
  const greeting = name ? `Hey ${name}` : "Hey bestie";
  const preview =
    step === 2
      ? "Meet the Club — kawaii cases, holographic charms, and how we email."
      : `${percentOff ?? 10}% off is still waiting on your first order.`;
  const heading =
    step === 2 ? `${greeting} — here's the vibe.` : `${greeting}, your code is still live.`;
  const ctaLabel = step === 2 ? "Shop the collection" : "Use your Club code";

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Text style={wordmarkStyle}>Y2KASE</Text>
            <Text style={taglineStyle}>kawaii · y2k · holographic</Text>
          </Section>

          <Section style={contentStyle}>
            <Text style={eyebrowStyle}>
              {step === 2 ? "Club note 2 of 3" : "Club note 3 of 3"}
            </Text>
            <Text style={greetingStyle}>{heading}</Text>
            {step === 2 ? (
              <>
                <Text style={paraStyle}>
                  Y2KASE is kawaii phone cases, holographic charms, and the
                  Y2K energy your lock screen has been missing. MagSafe where
                  it matters. Character drops when they&apos;re actually in
                  stock.
                </Text>
                <Text style={paraStyle}>
                  How we email: a Tuesday Club Drop when there&apos;s something
                  new, a Thursday note when there&apos;s an offer, and that&apos;s
                  the weekly rhythm. No daily spam. You can leave from any
                  email.
                </Text>
              </>
            ) : (
              <>
                <Text style={paraStyle}>
                  Your subscriber welcome is still sitting unused. One code,
                  first order, no minimum — then we stop reminding you about
                  it.
                </Text>
                {code ? (
                  <Section style={codeBlockStyle}>
                    <Text style={codeStyle}>{code}</Text>
                    <Text style={codeSubStyle}>
                      {percentOff ?? 10}% off · Enter at checkout · One use
                    </Text>
                  </Section>
                ) : null}
              </>
            )}

            {products.length > 0 ? (
              <>
                <Text style={sectionLabelStyle}>Worth a look</Text>
                {products.map((product) => (
                  <Section key={product.href} style={productRowStyle}>
                    <Img
                      src={product.imageUrl}
                      alt={product.title}
                      width={88}
                      height={88}
                      style={productImageStyle}
                    />
                    <Text style={productTitleStyle}>
                      <a href={product.href} style={productLinkStyle}>
                        {product.title}
                      </a>
                    </Text>
                  </Section>
                ))}
              </>
            ) : null}

            <Button href={shopUrl} style={ctaStyle}>
              {ctaLabel}
            </Button>

            <Hr style={hrStyle} />
            <Text style={smallStyle}>
              This is part of the welcome series you joined the Club for —
              not a new subscription.
            </Text>
            <Text style={smallStyle}>
              Questions? Email us at{" "}
              <a href="mailto:hello@y2kase.com" style={linkStyle}>
                hello@y2kase.com
              </a>
            </Text>
          </Section>

          <Section style={footerStyle}>
            <Text style={footerTextStyle}>{postalAddress}</Text>
            <Text style={footerTextStyle}>
              © {new Date().getFullYear()} Y2KASE · All rights reserved
            </Text>
            <Text style={footerTextStyle}>
              <a
                href="https://y2kase.com/policies/privacy-policy"
                style={footerLinkStyle}
              >
                Privacy Policy
              </a>
              {" · "}
              <a
                href="https://y2kase.com/policies/refund-policy"
                style={footerLinkStyle}
              >
                Refund Policy
              </a>
              {unsubscribeUrl ? (
                <>
                  {" · "}
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

export default ClubNurtureEmail;

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
  background:
    "linear-gradient(120deg,#ffc2ea 0%,#e6c5ff 33%,#c4e2ff 66%,#c4ffe8 100%)",
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

const eyebrowStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "#ff3ea5",
  margin: "0 0 10px",
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

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#34203b",
  opacity: 0.55,
  margin: "22px 0 12px",
};

const productRowStyle: React.CSSProperties = {
  margin: "0 0 12px",
};

const productImageStyle: React.CSSProperties = {
  borderRadius: "12px",
  border: "1px solid #f1d3ec",
  objectFit: "cover",
  display: "block",
};

const productTitleStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  margin: "8px 0 0",
  color: "#34203b",
};

const productLinkStyle: React.CSSProperties = {
  color: "#34203b",
  textDecoration: "none",
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
  margin: "24px auto 28px",
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
