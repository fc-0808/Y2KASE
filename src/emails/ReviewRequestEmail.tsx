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
  Img,
  Link,
} from "@react-email/components";
import * as React from "react";

export type ReviewRequestMailItem = {
  title: string;
  imageUrl?: string | null;
  reviewUrl: string;
  /** Five links, 1 star through 5 stars. */
  starUrls: [string, string, string, string, string];
};

interface ReviewRequestEmailProps {
  name?: string;
  items: ReviewRequestMailItem[];
  reminder?: boolean;
  unsubscribeUrl?: string;
  postalAddress: string;
}

export function ReviewRequestEmail({
  name,
  items,
  reminder = false,
  unsubscribeUrl,
  postalAddress,
}: ReviewRequestEmailProps) {
  const greeting = name ? `Hey ${name}` : "Hey";
  const lead = reminder
    ? "Checking in, in case the first note arrived before the parcel. If you've had a chance to use it, one honest line still helps the next person."
    : "Your order should be with you by now. Does it look like the photos, and how's the fit? That one note is what helps the next person decide.";

  return (
    <Html lang="en">
      <Head />
      <Preview>
        {reminder
          ? "If your Y2KASE order has arrived, a review helps the next person."
          : "Does your Y2KASE case look like the photos?"}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Text style={wordmarkStyle}>Y2KASE</Text>
            <Text style={taglineStyle}>how’s it going?</Text>
          </Section>

          <Section style={contentStyle}>
            <Text style={greetingStyle}>{greeting}</Text>
            <Text style={paraStyle}>{lead}</Text>

            {items.map((item) => (
              <Section key={item.reviewUrl} style={itemStyle}>
                {item.imageUrl ? (
                  <Img
                    src={item.imageUrl}
                    alt=""
                    width="96"
                    height="96"
                    style={imageStyle}
                  />
                ) : null}
                <Text style={itemTitleStyle}>{item.title}</Text>
                <Text style={starRowStyle}>
                  {item.starUrls.map((href, index) => (
                    <Link key={href} href={href} style={starLinkStyle}>
                      {index + 1}★
                    </Link>
                  ))}
                </Text>
                <Button href={item.reviewUrl} style={ctaStyle}>
                  Write a review
                </Button>
              </Section>
            ))}

            <Hr style={hrStyle} />

            <Text style={smallStyle}>
              Not quite right? Just reply to this email — we&apos;ll make it right.
              Any review is welcome. The rating does not change anything we send you.
            </Text>
          </Section>

          <Section style={footerStyle}>
            <Text style={footerTextStyle}>{postalAddress}</Text>
            <Text style={footerTextStyle}>
              © {new Date().getFullYear()} Y2KASE · All rights reserved
            </Text>
            {unsubscribeUrl ? (
              <Text style={footerTextStyle}>
                <a href={unsubscribeUrl} style={footerLinkStyle}>
                  Unsubscribe
                </a>
              </Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default ReviewRequestEmail;

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
  margin: "0 0 20px",
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
  margin: "8px auto 0",
  boxShadow: "0 4px 0 #d62f88",
};

const itemStyle: React.CSSProperties = {
  margin: "0 0 20px",
  padding: "16px",
  border: "1px solid #f1d3ec",
  borderRadius: "16px",
};

const imageStyle: React.CSSProperties = {
  borderRadius: "12px",
  objectFit: "cover",
  margin: "0 0 12px",
};

const itemTitleStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: "700",
  color: "#34203b",
  lineHeight: "1.4",
  margin: "0 0 8px",
};

const starRowStyle: React.CSSProperties = {
  margin: "0 0 4px",
  lineHeight: "1",
};

const starLinkStyle: React.CSSProperties = {
  display: "inline-block",
  color: "#34203b",
  fontSize: "14px",
  fontWeight: "700",
  textDecoration: "none",
  padding: "6px 8px",
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
  margin: 0,
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
