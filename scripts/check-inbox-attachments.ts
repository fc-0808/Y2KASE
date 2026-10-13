/**
 * Inbox attachment invariants — CID rewrite, mail-proxy rebinding, and
 * MIME noise filtering. If this drifts, /admin/inbox shows a broken-image
 * icon for customer photos again.
 *
 *   tsx scripts/check-inbox-attachments.ts
 */
import assert from "node:assert/strict";
import PostalMime from "postal-mime";
import {
  buildEmailSrcDoc,
  collectInboxAttachmentUrls,
  contentDispositionHeader,
  formatAttachmentSize,
  htmlContainsInboxAttachments,
  inboxAttachmentUrl,
  isNoiseAttachment,
  isProbablyTrackingPixel,
  isUnreliableInlineImageSrc,
  normalizeCid,
  parseAttachmentId,
  parseInboxMailbox,
  parseInboxUid,
  prepareInboxBody,
  type PostalAttachmentLike,
} from "../src/lib/inbox/attachments";
import {
  composeReplyContent,
  sniffReplyImage,
} from "../src/lib/inbox/reply-images";
import {
  buildReplyRaw,
  isReplyRecipient,
  readReplyImages,
  replySubject,
} from "../src/lib/inbox/reply-message";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> | void {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(
        () => {
          passed += 1;
        },
        (err: unknown) => {
          failed += 1;
          console.error(`  ✗ ${name}`);
          console.error(err instanceof Error ? err.stack : err);
        },
      );
    }
    passed += 1;
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(err instanceof Error ? err.stack : err);
  }
}

const jpegBytes = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0xff, 0xd9,
]);

function jpegPart(
  overrides: Partial<PostalAttachmentLike> = {},
): PostalAttachmentLike {
  return {
    filename: "case.jpg",
    mimeType: "image/jpeg",
    disposition: "inline",
    related: true,
    contentId: "<photo@y2kase>",
    content: jpegBytes,
    ...overrides,
  };
}

function mimeMessage(html: string, cid = "photo@y2kase"): string {
  const b64 = Buffer.from(jpegBytes).toString("base64");
  return [
    "From: customer@gmail.com",
    "To: hello@y2kase.com",
    "Subject: Custom case",
    "MIME-Version: 1.0",
    "Content-Type: multipart/related; boundary=BOUND",
    "",
    "--BOUND",
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
    `--BOUND`,
    "Content-Type: image/jpeg",
    "Content-Transfer-Encoding: base64",
    `Content-ID: <${cid}>`,
    'Content-Disposition: inline; filename="case.jpg"',
    "",
    b64,
    "--BOUND--",
    "",
  ].join("\r\n");
}

async function main(): Promise<void> {
  test("gmail cid with angle brackets rewrites to the attachment URL", () => {
  const prepared = prepareInboxBody(
    {
      html: '<p>Hi</p><img src="cid:photo@y2kase" alt="case">',
      text: "Hi",
      attachments: [jpegPart()],
    },
    42,
  );
  assert.equal(prepared.attachments.length, 1);
  assert.equal(prepared.attachments[0]?.inlined, true);
  assert.equal(prepared.attachments[0]?.listed, false);
  assert.match(
    prepared.html ?? "",
    /src="\/api\/admin\/inbox\/attachment\?uid=42&amp;id=a0"/,
  );
  assert.equal(prepared.html?.includes("cid:"), false);
  assert.deepEqual(collectInboxAttachmentUrls(prepared.html ?? ""), [
    inboxAttachmentUrl(42, "a0"),
  ]);
});

test("cid local-part matches a Content-ID that includes a domain", () => {
  const prepared = prepareInboxBody(
    {
      html: '<img src="cid:ii_abc123">',
      attachments: [
        jpegPart({ contentId: "<ii_abc123@gmail.com>", filename: "IMG_1.jpg" }),
      ],
    },
    7,
  );
  assert.equal(prepared.attachments[0]?.inlined, true);
  assert.match(prepared.html ?? "", /id=a0/);
});

test("mismatched leftover cid binds unused images in order", () => {
  const prepared = prepareInboxBody(
    {
      html: '<img src="cid:does-not-match">',
      attachments: [jpegPart({ contentId: "<other@id>" })],
    },
    3,
  );
  assert.equal(prepared.attachments[0]?.inlined, true);
  assert.match(prepared.html ?? "", /attachment\?uid=3&amp;id=a0/);
});

test("googleusercontent proxy images are rebound to the real part", () => {
  const prepared = prepareInboxBody(
    {
      html: '<img src="https://ci3.googleusercontent.com/proxy/abc" alt="photo">',
      attachments: [jpegPart({ contentId: undefined, disposition: "attachment", related: false })],
    },
    9,
  );
  assert.equal(prepared.attachments[0]?.inlined, true);
  assert.equal(prepared.attachments[0]?.listed, false);
  assert.match(prepared.html ?? "", /\/api\/admin\/inbox\/attachment\?uid=9&amp;id=a0/);
});

test("1x1 tracking pixels are left alone", () => {
  const html =
    '<img src="https://ci3.googleusercontent.com/proxy/pixel" width="1" height="1">';
  assert.equal(isProbablyTrackingPixel(html), true);
  const prepared = prepareInboxBody(
    {
      html,
      attachments: [jpegPart({ contentId: undefined, disposition: "attachment", related: false })],
    },
    11,
  );
  assert.equal(prepared.attachments[0]?.listed, true);
  assert.equal(prepared.attachments[0]?.inlined, false);
  assert.match(prepared.html ?? "", /googleusercontent/);
});

test("paperclip-only images stay in the gallery and out of empty html", () => {
  const prepared = prepareInboxBody(
    {
      html: "<p>I've attached a photo.</p>",
      text: "I've attached a photo.",
      attachments: [
        jpegPart({
          contentId: undefined,
          disposition: "attachment",
          related: false,
        }),
      ],
    },
    5,
  );
  assert.equal(prepared.attachments[0]?.listed, true);
  assert.equal(prepared.attachments[0]?.inlined, false);
  assert.equal(prepared.html, "<p>I've attached a photo.</p>");
});

test("text-only messages still expose image attachments", () => {
  const prepared = prepareInboxBody(
    {
      html: null,
      text: "See attached",
      attachments: [jpegPart({ disposition: "attachment", related: false })],
    },
    8,
  );
  assert.equal(prepared.html, null);
  assert.equal(prepared.attachments[0]?.listed, true);
  assert.equal(prepared.binaries[0]?.bytes.byteLength, jpegBytes.byteLength);
});

test("pkcs7 signatures are dropped", () => {
  assert.equal(
    isNoiseAttachment("application/pkcs7-signature", "smime.p7s"),
    true,
  );
  const prepared = prepareInboxBody(
    {
      html: "<p>Hi</p>",
      attachments: [
        {
          filename: "smime.p7s",
          mimeType: "application/pkcs7-signature",
          disposition: "attachment",
          content: new Uint8Array([1, 2, 3, 4]),
        },
        jpegPart(),
      ],
    },
    1,
  );
  assert.equal(prepared.attachments.length, 1);
  assert.equal(prepared.attachments[0]?.filename, "case.jpg");
});

test("octet-stream with a .png name is treated as an image", () => {
  const prepared = prepareInboxBody(
    {
      html: null,
      attachments: [
        {
          filename: "photo.png",
          mimeType: "application/octet-stream",
          disposition: "attachment",
          content: jpegBytes,
        },
      ],
    },
    4,
  );
  assert.equal(prepared.attachments[0]?.isImage, true);
  assert.equal(prepared.attachments[0]?.mimeType, "image/png");
});

test("relative Outlook filenames are rebound", () => {
  const prepared = prepareInboxBody(
    {
      html: '<img src="image001.jpg">',
      attachments: [jpegPart({ contentId: undefined, filename: "image001.jpg" })],
    },
    6,
  );
  assert.equal(prepared.attachments[0]?.inlined, true);
  assert.match(prepared.html ?? "", /id=a0/);
});

test("data URIs and our own attachment URLs are trusted", () => {
  assert.equal(isUnreliableInlineImageSrc("data:image/png;base64,aaaa"), false);
  assert.equal(
    isUnreliableInlineImageSrc("/api/admin/inbox/attachment?uid=1&id=a0"),
    false,
  );
  assert.equal(isUnreliableInlineImageSrc("cid:foo"), true);
  assert.equal(isUnreliableInlineImageSrc("https://y2kase.com/logo.png"), false);
});

test("srcDoc injects max-width CSS for images", () => {
  const src = buildEmailSrcDoc("<p>Hi</p><img src=x>");
  assert.match(src, /img,video,svg\{max-width:100%/);
  assert.match(src, /<body><p>Hi<\/p><img src=x><\/body>/);
});

test("uid and attachment ids reject traversal", () => {
  assert.equal(parseInboxUid("42"), 42);
  assert.equal(parseInboxUid("0"), null);
  assert.equal(parseInboxUid("-1"), null);
  assert.equal(parseInboxUid("12abc"), null);
  assert.equal(parseInboxUid("../etc"), null);
  assert.equal(parseAttachmentId("a0"), "a0");
  assert.equal(parseAttachmentId("a99"), "a99");
  assert.equal(parseAttachmentId("a100"), null);
  assert.equal(parseAttachmentId("../a0"), null);
  assert.equal(parseAttachmentId("a0/../../"), null);
});

test("Content-Disposition encodes unicode filenames", () => {
  const header = contentDispositionHeader("케이스.jpg", "inline");
  assert.match(header, /^inline; filename="/);
  assert.match(header, /filename\*=UTF-8''%EC%BC%80%EC%9D%B4%EC%8A%A4\.jpg$/);
});

test("normalizeCid strips brackets and cid: prefix", () => {
  assert.equal(normalizeCid("<ii_abc@gmail.com>"), "ii_abc@gmail.com");
  assert.equal(normalizeCid("cid:ii_abc"), "ii_abc");
});

test("formatAttachmentSize uses human units", () => {
  assert.equal(formatAttachmentSize(800), "800 B");
  assert.equal(formatAttachmentSize(1536), "1.5 KB");
  assert.equal(formatAttachmentSize(2 * 1024 * 1024), "2.0 MB");
});

test("htmlContainsInboxAttachments detects rewritten parts", () => {
  const html = '<img src="/api/admin/inbox/attachment?uid=1&amp;id=a0">';
  assert.equal(htmlContainsInboxAttachments(html), true);
  assert.equal(htmlContainsInboxAttachments("<p>nope</p>"), false);
});

test("sent mailbox attachment urls stay on that folder", () => {
  const prepared = prepareInboxBody(
    {
      html: '<img src="cid:photo@y2kase">',
      text: "Hi",
      attachments: [jpegPart()],
    },
    42,
    "sent",
  );
  assert.match(prepared.html ?? "", /mailbox=sent/);
  assert.deepEqual(collectInboxAttachmentUrls(prepared.html ?? ""), [
    inboxAttachmentUrl(42, "a0", { mailbox: "sent" }),
  ]);
  assert.equal(
    collectInboxAttachmentUrls(prepared.html ?? "")[0]?.includes("mailbox=inbox"),
    false,
  );
});

test("mailbox query only accepts sent", () => {
  assert.equal(parseInboxMailbox("sent"), "sent");
  assert.equal(parseInboxMailbox("inbox"), "inbox");
  assert.equal(parseInboxMailbox("Trash"), "inbox");
  assert.equal(parseInboxMailbox("../Sent"), "inbox");
  assert.equal(parseInboxMailbox(null), "inbox");
});

test("reply body escapes html and inlines the photo", () => {
  const content = composeReplyContent({
    body: "Here is <the> photo & more",
    quotedText: "<script>alert(1)</script>",
    images: [{ cid: "photo-1@y2kase.com", filename: 'case".jpg' }],
    sentOn: new Date("2026-10-12T00:00:00Z"),
  });
  assert.match(content.html, /Here is &lt;the&gt; photo &amp; more/);
  assert.match(content.html, /src="cid:photo-1@y2kase.com"/);
  assert.match(content.html, /alt="case&quot;\.jpg"/);
  assert.equal(content.html.includes("<script>"), false);
  assert.match(content.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(content.text, /\[Image: case"\.jpg\]/);
});

test("reply subject and image sniff", () => {
  assert.equal(replySubject("Order 646"), "Re: Order 646");
  assert.equal(replySubject("Re: Order 646"), "Re: Order 646");
  assert.equal(replySubject("re: already"), "re: already");
  assert.equal(isReplyRecipient("fan@example.com"), true);
  assert.equal(isReplyRecipient("hello\r\nBcc: evil@x.com"), false);
  assert.equal(isReplyRecipient("not-an-email"), false);
  assert.equal(sniffReplyImage(jpegBytes), "image/jpeg");
  assert.equal(
    sniffReplyImage(Uint8Array.from(Buffer.from("<html>not an image!!"))),
    null,
  );
});

  await test("PostalMime round-trip rewrites a real multipart/related message", async () => {
    const raw = mimeMessage('<p>Photo</p><img src="cid:photo@y2kase">');
    const parsed = await PostalMime.parse(raw);
    const prepared = prepareInboxBody(parsed, 99);
    assert.ok(parsed.attachments.length >= 1);
    assert.equal(prepared.attachments[0]?.inlined, true);
    assert.match(prepared.html ?? "", /uid=99&amp;id=a0/);
    assert.equal(prepared.binaries[0]?.bytes.byteLength > 0, true);
  });

  await test("readReplyImages rejects html renamed as a photo", async () => {
    const file = new File([Buffer.from("<html>not an image!!")], "photo.jpg", {
      type: "image/jpeg",
    });
    const result = await readReplyImages([file]);
    assert.equal("error" in result, true);
  });

  await test("readReplyImages accepts a real jpeg", async () => {
    const file = new File([Buffer.from(jpegBytes)], "case.jpg", {
      type: "image/jpeg",
    });
    const result = await readReplyImages([file]);
    assert.equal("images" in result, true);
    if (!("images" in result)) return;
    assert.equal(result.images[0]?.mimeType, "image/jpeg");
    assert.equal(result.images[0]?.filename, "case.jpg");
  });

  await test("built reply embeds the photo bytes", async () => {
    const built = await buildReplyRaw({
      from: "Y2KASE <hello@y2kase.com>",
      to: "fan@example.com",
      subject: "Order 646",
      body: "Here is <the> photo",
      images: [
        {
          filename: "case.jpg",
          mimeType: "image/jpeg",
          bytes: Buffer.from(jpegBytes),
          cid: "photo-1@y2kase.com",
        },
      ],
    });
    const raw = built.raw.toString("utf8");
    assert.equal(built.subject, "Re: Order 646");
    assert.match(raw, /image\/jpeg/);
    assert.match(raw, /photo-1@y2kase\.com/);
    assert.match(raw, /&lt;the&gt;/);

    const parsed = await PostalMime.parse(built.raw);
    const prepared = prepareInboxBody(parsed, 8, "sent");
    assert.equal(prepared.attachments[0]?.isImage, true);
    assert.match(prepared.html ?? "", /mailbox=sent/);
    assert.equal(prepared.html?.includes("cid:"), false);
  });

  if (failed > 0) {
    console.error(`\n${failed} inbox-attachment check(s) failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`✓ inbox attachment invariants passed (${passed})`);
}

void main();
