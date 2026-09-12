# Analytics bot defense

The Visitors dashboard is first-party operational analytics, not an
authentication or fraud-decision system. A request is counted only after it
passes independent edge, request-integrity, automation and cookie checks.

## Active Vercel controls

The production project has these all-host IP denies:

- `43.119.100.0/24`
- `43.119.104.0/24`
- `47.82.201.0/24`
- `47.82.202.0/24`

They are the exact Alibaba Cloud Singapore ranges observed in the
2026-09-03 rotating-proxy incident. Do not broaden this to all of AS45102
without reviewing legitimate traffic first.

`POST /api/track` also has a fixed-window WAF rule:

- Key: JA4 TLS fingerprint
- Limit: 30 requests per 60 seconds
- Exceeded action: deny for 5 minutes

JA4 is deliberate: an IP-only rule does not constrain a rotating proxy pool.
The endpoint is non-critical, so dropping excess analytics is safer than
allowing a fingerprint to amplify database writes.

Firewall changes are staged before they are live. Always inspect the diff:

```shell
npx vercel@latest firewall ip-blocks list
npx vercel@latest firewall rules list --expand
npx vercel@latest firewall diff
npx vercel@latest firewall publish
```

Attack Mode is the temporary fallback for a new, active site-wide flood. It
challenges legitimate visitors too, so enable it only while investigating and
disable it when targeted controls are live.

## Application controls

`src/app/api/track/route.ts` applies these checks in order:

1. Deny known crawler and confirmed abuse networks before reading the body.
2. Exclude internal fresh-visit QA sessions.
3. Require the current tracker marker, JSON, same-origin Fetch Metadata and a
   matching Origin/Host.
4. Enforce a streaming 2 KiB body limit.
5. Use the maintained `isbot` corpus plus positive automation signals
   (`navigator.webdriver` and contradictory platform/mobile hints).
6. Apply per-IP, per-/24 or /64, per-fingerprint and per-visitor backstops.
7. Require an HMAC-proven HttpOnly visitor cookie before persistence.

The first valid beacon sets `y2k_vid` and `y2k_vproof` but is not counted.
`VisitorTracker` immediately retries it. This preserves a real first page view
while preventing one-shot requests and caller-invented UUIDs from becoming
unique visitors.

`ANALYTICS_COOKIE_SECRET` is optional and falls back to
`BETTER_AUTH_SECRET`. Rotating it is safe: browsers keep their visitor ID,
receive a new proof, and retry before the next view is recorded.

The in-process rate limits are defense in depth, not global enforcement.
Vercel WAF owns the global limit. The local map is hard-capped so high-cardinality
keys cannot exhaust a worker.

## Reporting and incident data

Confirmed abuse ranges are filtered both at capture and in reporting. This
immediately repairs dashboard totals after deployment while preserving raw
rows for incident analysis. Do not delete raw rows during an active incident.

When adding a range:

1. Confirm a shared fingerprint, burst pattern and hosting ASN from raw data.
2. Add the narrowest justified CIDR to Vercel IP Blocking.
3. Add it to `ABUSIVE_ANALYTICS_IPV4_CIDRS` in
   `src/lib/analytics/bot-defense.ts`; the reporting prefix is derived from it.
4. Run `npm run analytics:check`, `npm run typecheck`, `npm run lint`, and
   `npm run build`.
5. Verify that rejected traffic stops while normal Vercel Web Analytics
   continues.
