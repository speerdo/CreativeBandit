# Go-live DNS

Everything that has to happen in DNS before `creativebandit.studio` is actually live and sending mail. Nothing here is wired up yet, deliberately — the domain is staying parked until launch.

**Where DNS lives:** Google Cloud DNS. Nameservers are `ns-cloud-c1..c4.googledomains.com`, so all records below are added in the Google Cloud console, not in Vercel.

**Current state (2026-08-18):**

| Thing | State |
|---|---|
| `creativebandit.studio` DNS | Google Cloud DNS |
| Resolves to | `68.66.210.129` — parked, not Vercel |
| Attached to Vercel project | **No** — absent from `vercel domains ls` and from the project's aliases |
| Resend sending domain | Registered, `status=not_started` — no records added |

---

## 1. Resend — email sending

Three records. Pulled from the Resend API on 2026-08-18 for domain id `b2ad4a08-f1d3-4683-8cc5-9ef237c854e2`, region `us-east-1`.

**Until these exist, the Resend API accepts sends and the mail bounces.** That is the quiet failure worth knowing about — nothing in the app will look broken. It affects both `/api/scan-report` and any list email.

### DKIM

| | |
|---|---|
| **Type** | `TXT` |
| **Name** | `resend._domainkey` |
| **TTL** | Auto |

```
p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDXkOoMhMw0fxXFDjukL3VPY459S6HofyeYjtAW41L7znU8Onh0TBeene3CxJNFlQXcMydRfEHBU5i2lonY3YHphtboLB1o5Gsea572y+BBWh2rVTOTSgr8zVamsY02XAtGFnxM441+yD6rR0DXj6Ow7ZAk+gHfHn5br4+psyDBqQIDAQAB
```

> This is a **public** key. It is meant to be published in DNS and is safe in this repo — do not treat it as a secret. The matching private key never leaves Resend.

### SPF — MX

| | |
|---|---|
| **Type** | `MX` |
| **Name** | `send` |
| **Priority** | `10` |
| **TTL** | Auto |

```
feedback-smtp.us-east-1.amazonses.com
```

### SPF — TXT

| | |
|---|---|
| **Type** | `TXT` |
| **Name** | `send` |
| **TTL** | Auto |

```
v=spf1 include:amazonses.com ~all
```

### After adding them

1. Hit **Verify** on the domain in the Resend dashboard. Propagation is usually minutes.
2. Confirm `status` flips from `not_started` to `verified`.
3. Send one real report to yourself from `/scan` before trusting it. A verified domain and a working send are not the same test.

> **If the region ever changes**, both SPF records change with it — they name `us-east-1` explicitly. Re-pull from the Resend dashboard rather than editing by hand.

---

## 2. Vercel — pointing the domain at the site

The domain is not attached to the project at all, so this is two steps, not one.

1. **Add the domain to the Vercel project** (`creative-bandit`) — dashboard, or `vercel domains add creativebandit.studio`.
2. **Add the records Vercel then shows you.** Deliberately not written down here: Vercel's recommended apex IP and CNAME target have changed more than once, and a stale value copied out of a doc is worse than no value. The dashboard shows the current pair for this project — use that.

Expect roughly:

- An `A` record on the apex (`@`) pointing at a Vercel IP, **or** a `CNAME` on `www` pointing at a `*.vercel-dns.com` target
- Whichever redirect direction you want between apex and `www`

Alternative: move the nameservers to Vercel entirely. Simpler ongoing, but it would move the Resend records above into Vercel DNS too, so decide before adding them rather than after.

### Watch out for

- **Do not remove the `send` MX record** when adding site records. It is scoped to the `send` subdomain and does not conflict with the apex, but bulk-editing MX records is the easy way to break sending.
- The site currently sends `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (`vercel.json`). Once a browser sees that header, it will refuse plain HTTP to the domain and every subdomain for two years. Make sure the cutover goes straight to working HTTPS.

---

## 3. Post-cutover checklist

- [ ] `creativebandit.studio` serves the Vercel deployment over HTTPS
- [ ] Apex and `www` both resolve, with the redirect going the intended way
- [ ] Resend domain reads `verified`
- [ ] A real scan report arrives, and lands in the inbox rather than spam
- [ ] List signup in the footer returns success and the contact appears in the Resend audience
- [ ] Contact form submits and the `/thank-you` redirect fires
- [ ] Vercel Web Analytics is enabled in the dashboard and recording pageviews
- [ ] `https://creativebandit.studio/sitemap-index.xml` loads, and submit it to **both** Google Search Console and Bing Webmaster Tools — see launch-readiness §7.2 for why Bing is not optional here
- [ ] Run the studio's own `/scan` against `creativebandit.studio` and fix whatever it reports

---

## Related

- `docs/creative-bandit-launch-readiness.md` §11 — email architecture, env vars, and why the report payload is signed
- `docs/creative-bandit-launch-readiness.md` §9.2 — scan rate limiting, still in-process and still the open item
