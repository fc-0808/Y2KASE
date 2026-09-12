import Link from "next/link";
import { faqAnswerSegments } from "@/lib/seo/faq";

/** Renders an FAQ answer with the same characters as JSON-LD, plus in-copy links. */
export function FaqAnswer({ answer }: { answer: string }) {
  const segments = faqAnswerSegments(answer);

  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "text" ? (
          <span key={index}>{segment.text}</span>
        ) : segment.href.startsWith("/") ? (
          <Link key={index} href={segment.href}>
            {segment.text}
          </Link>
        ) : (
          <a key={index} href={segment.href}>
            {segment.text}
          </a>
        ),
      )}
    </>
  );
}
