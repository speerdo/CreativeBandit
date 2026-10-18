# UTM convention

Every link we post off-site to creativebandit.studio carries UTM tags, so Vercel Web Analytics and Ahrefs Web Analytics can attribute visits to a channel and campaign.

| Param | Values | Notes |
|---|---|---|
| `utm_source` | `linkedin`, `reddit`, `google` | Where the link was posted. |
| `utm_medium` | `social`, `cpc` | `social` for organic posts, `cpc` for paid ads. |
| `utm_campaign` | `<slug>` | Lowercase, hyphenated, one per post or ad group, e.g. `scan-findings-wk2`. |

Example:

```
https://creativebandit.studio/scan?utm_source=linkedin&utm_medium=social&utm_campaign=scan-findings-wk2
```

Rules:

- Point posts and ads at `/scan` unless there is a reason not to.
- Never tag internal links. UTMs on in-site links overwrite the visit's real source.
- Reuse a campaign slug only for the same post or ad group, so results stay separable.

## Analytics

- Vercel Web Analytics: `<Analytics />` in `src/layouts/Layout.astro`, same-origin, no CSP entry needed.
- Ahrefs Web Analytics: script in `Layout.astro`, `analytics.ahrefs.com` allowed in `script-src` and `connect-src` in `vercel.json`. Ahrefs project 10539358.
