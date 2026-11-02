# Analytics bot defense

The Visitors dashboard is first-party operational analytics, not an
authentication or fraud-decision system. A request is counted only after it
passes independent edge, request-integrity, automation and cookie checks.

## Active Vercel controls

The production project denies these hosting ranges on every host. The same
list lives in `ABUSIVE_ANALYTICS_IPV4_CIDRS`.

Vercel IP Blocking allows 10 entries, and nothing wider than a /16. The four
Alibaba /24s below use that list. The October ranges are the custom rule
`Singapore cloud proxy farm`: each /13 and /12 is stored as the /16s it
contains, which is the same set of addresses.

September 2026, Alibaba Cloud Singapore (AS45102), four observed /24s:

- `43.119.100.0/24`
- `43.119.104.0/24`
- `47.82.201.0/24`
- `47.82.202.0/24`

October 2026, the one-page proxy farm moved to Tencent Cloud Singapore
(Aceville PTE LTD, AS132203) and Huawei Cloud Singapore (AS136907). Blocking
each /24 failed as soon as the pool rotated, so the deny is the registry
allocation that contained the traffic:

- `43.128.0.0/13`, `43.152.0.0/13`, `43.160.0.0/12`
- `101.32.0.0/16`, `129.226.0.0/16`, `150.109.0.0/19`
- `49.0.200.0/21`, `101.44.160.0/20`, `111.119.192.0/18`
- `119.8.160.0/19`, `119.13.96.0/20`
- `124.243.128.0/20`, `124.243.160.0/19`, `159.138.120.0/22`
- `188.239.0.0/20`, `188.239.32.0/20`

Do not widen this to all of AS132203 or AS45102. Those ASNs also announce
ranges outside this incident, including Tencent space a supplier can use.
Do not deny Singapore itself. StarHub, Singtel, M1 and Simba had ordinary
browsing sessions and stay allowed. Tencent China (AS45090) is not in this
list; owner and supplier traffic from CN, TW and HK is already omitted from
reports without being blocked at the edge.

`POST /api/track` also has a fixed-window WAF rule:

- Key: JA4 TLS fingerprint
- Limit: 30 requests per 60 seconds
- Exceeded action: deny for 5 minutes

JA4 is deliberate: an IP-only rule does not constrain a rotating proxy pool.
The endpoint is non-critical, so dropping excess analytics is safer than
allowing a fingerprint to amplify database writes. A crawl that waits several
minutes between pages never reaches this limit. Do not lower it to catch that
pace: one JA4 is shared by every shopper on the same Chrome version.

## Residential catalog crawl

On 2026-11-01 the same Chrome presets reappeared on US consumer ISPs
(AT&T, Comcast, Starlink, T-Mobile, Cox, CenturyLink, Cable One), about one
page every six minutes, mostly `/products`. That is a catalog copy using
rented home connections after the Singapore ranges were denied. Do not deny
those ISPs.

Two edge checks cover it instead:

- Bot Protection is in challenge mode. A client that claims to be a browser
  but fails Vercel's browser check must pass a JavaScript checkpoint. A
  shopper passes once per hour. A scraper that changes address every request
  has to pass every time, and an automated browser fails that check.
- `Challenge scripted Chrome` challenges a Chrome user agent that omits
  `sec-ch-ua`. Real Chrome sends that header on every request. Googlebot is
  excluded because its renderer identifies itself in the same user agent.

Bot Protection challenges clients that pretend to be a browser. Stripe,
Resend, and Vercel cron do not send a Chrome user agent, so they are not
challenged. The project can hold only three custom rules, so there is no
separate bypass entry.

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
3. Add the CIDR to `ABUSIVE_ANALYTICS_IPV4_CIDRS` in
   `src/lib/analytics/bot-defense.ts`. Capture and reporting both match that
   list, so historical rows drop out of the dashboard without a delete.
4. Run `npm run analytics:check`, `npm run typecheck`, `npm run lint`, and
   `npm run build`.
5. Verify that rejected traffic stops while normal Vercel Web Analytics
   continues.
