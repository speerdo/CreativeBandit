/*
 * HTML for the scan report email.
 *
 * Hand-written table layout rather than a component framework, because email
 * clients are not browsers: Outlook's engine is Word, Gmail strips <style>
 * blocks in some contexts, and flexbox and grid are unusable. Inline styles
 * on nested tables is the boring thing that renders everywhere.
 *
 * The palette is the site's, but the page's dark ground is deliberately NOT
 * carried over. Dark email backgrounds fight every client's own dark-mode
 * inversion and end up unreadable in about a third of them; a light report
 * is what an agency can forward to a client without it looking broken. That
 * forwarding is the whole point of the feature - see
 * docs/creative-bandit-launch-readiness.md §9.1.
 */

import type { Finding, ScanResult } from '../scanner/types';

const TAG_STYLE: Record<Finding['tag'], { label: string; color: string; bg: string }> = {
  gap: { label: 'Gap', color: '#B3341A', bg: '#FBEAE6' },
  opportunity: { label: 'Opportunity', color: '#3A42B8', bg: '#ECEDFB' },
  good: { label: 'Good', color: '#5C5A00', bg: '#FAF8DC' },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderFinding(finding: Finding): string {
  const tag = TAG_STYLE[finding.tag];
  const evidence = finding.evidence?.quote
    ? `<tr><td style="padding:8px 0 0;">
         <code style="display:block;background:#F4F2EE;border:1px solid #E2DED6;padding:8px 10px;font-family:Menlo,Consolas,monospace;font-size:12px;color:#3A3A3A;word-break:break-all;">${escapeHtml(
           finding.evidence.quote
         )}</code>
       </td></tr>`
    : '';

  return `
  <tr><td style="padding:0 0 20px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="border:1px solid #E2DED6;border-left:3px solid ${tag.color};">
      <tr><td style="padding:16px 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding:0 0 8px;">
            <span style="display:inline-block;background:${tag.bg};color:${tag.color};font-family:Menlo,Consolas,monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:4px 8px;">${tag.label}</span>
          </td></tr>
          <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;color:#1A1A1A;padding:0 0 6px;">
            ${escapeHtml(finding.title)}
          </td></tr>
          <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#4A4A4A;">
            ${escapeHtml(finding.detail)}
          </td></tr>
          ${evidence}
          <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1A1A1A;padding:10px 0 0;">
            <strong>Fix:</strong> ${escapeHtml(finding.remediation)}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>`;
}

export function renderReportHtml(result: ScanResult): string {
  const host = (() => {
    try {
      return new URL(result.url).hostname;
    } catch {
      return result.url;
    }
  })();

  const counts = result.findings.reduce(
    (acc, f) => ({ ...acc, [f.tag]: (acc[f.tag] ?? 0) + 1 }),
    {} as Record<Finding['tag'], number>
  );

  const summary = [
    counts.gap ? `${counts.gap} gap${counts.gap === 1 ? '' : 's'}` : null,
    counts.opportunity ? `${counts.opportunity} opportunit${counts.opportunity === 1 ? 'y' : 'ies'}` : null,
    counts.good ? `${counts.good} already right` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // A partial report is still a success, but it has to say so out loud
  // rather than let the reader assume the silent checks passed.
  const incomplete = result.incomplete.length
    ? `<tr><td style="padding:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:#8A6D3B;background:#FCF8E3;border:1px solid #F0E4C0;padding:12px 14px;">
         ${result.incomplete.length} check${result.incomplete.length === 1 ? '' : 's'} did not complete on this run, so this report does not cover ${result.incomplete.length === 1 ? 'it' : 'them'}.
       </td></tr>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI readiness scan — ${escapeHtml(host)}</title></head>
<body style="margin:0;padding:0;background:#EDE8DF;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#EDE8DF;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background:#FFFFFF;">

      <tr><td style="background:#0B0B0C;padding:24px 28px;">
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#FFE800;">Creative Bandit</div>
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:bold;color:#EDE8DF;padding-top:6px;">AI Readiness Scan</div>
        <div style="font-family:Menlo,Consolas,monospace;font-size:13px;color:#B5AEA3;padding-top:8px;">${escapeHtml(host)}</div>
      </td></tr>

      <tr><td style="padding:28px 28px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#4A4A4A;padding:0 0 8px;">
            Here is the full report for <strong style="color:#1A1A1A;">${escapeHtml(host)}</strong>${summary ? ` — ${escapeHtml(summary)}` : ''}.
          </td></tr>
          <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#4A4A4A;padding:0 0 24px;">
            It is yours to keep, and yours to forward. Take it to your client and win the work yourself, or send it back to us and we will build the fixes under your name.
          </td></tr>
          ${incomplete}
        </table>
      </td></tr>

      <tr><td style="padding:0 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${result.findings.map(renderFinding).join('')}
        </table>
      </td></tr>

      <tr><td style="padding:8px 28px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="background:#E8451F;">
            <a href="https://creativebandit.studio/contact"
               style="display:inline-block;padding:14px 24px;font-family:Menlo,Consolas,monospace;font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#0B0B0C;text-decoration:none;">
              Talk to us about the build
            </a>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="border-top:1px solid #E2DED6;padding:20px 28px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#8A8A8A;">
        Creative Bandit, LLC · Indianapolis, IN<br>
        You received this because someone ran a scan on ${escapeHtml(host)} and asked for a copy. This is a one-off report, not a subscription.
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Plain-text alternative. Absent, spam filters mark the message down. */
export function renderReportText(result: ScanResult): string {
  const lines = [
    `AI READINESS SCAN — ${result.url}`,
    '',
    ...result.findings.flatMap((f) => [
      `[${TAG_STYLE[f.tag].label.toUpperCase()}] ${f.title}`,
      f.detail,
      f.evidence?.quote ? `  > ${f.evidence.quote}` : null,
      `Fix: ${f.remediation}`,
      '',
    ]),
  ].filter((l): l is string => l !== null);

  if (result.incomplete.length) {
    lines.push(
      `${result.incomplete.length} check(s) did not complete on this run.`,
      ''
    );
  }

  lines.push(
    'Take this to your client and win the work yourself, or send it back to',
    'us and we will build the fixes under your name.',
    '',
    'https://creativebandit.studio/contact',
    '',
    'Creative Bandit, LLC · Indianapolis, IN'
  );

  return lines.join('\n');
}
