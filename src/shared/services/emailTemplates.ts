/**
 * Shared transactional-email chrome. One brand shell + a couple of reusable content
 * blocks (button, code box) that every email in email.service.ts builds on — so a brand
 * tweak (color, footer copy, logo mark) happens in exactly one place, not once per email.
 *
 * Table-based layout + inline styles throughout, since that's still the only markup email
 * clients (notably Outlook desktop, which renders HTML via Word) reliably support — a
 * `<style>` block is included too for the clients that do support it (media query for
 * mobile padding, link/button hover), but nothing structural depends on it.
 */

export const EMAIL_BRAND = {
  name: 'BudgetBrain',
  primary: '#6366F1',
  primaryDark: '#4F46E5',
  success: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
  pageBackground: '#F1F5F9',
  cardBackground: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  border: '#E2E8F0',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;

/** Escapes a string for safe interpolation into HTML — every email inserts at least one
 *  user-controlled value (a name, a family group name), so this isn't optional. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function emailButton(label: string, href: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 28px 0;">
      <tr>
        <td style="border-radius: 10px; background-color: ${EMAIL_BRAND.primary};">
          <a href="${href}" target="_blank"
             style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 700;
                    color: #FFFFFF; text-decoration: none; border-radius: 10px; font-family: ${EMAIL_BRAND.fontFamily};">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

export function emailCodeBox(code: string): string {
  return `
    <div style="background-color: ${EMAIL_BRAND.pageBackground}; border: 1.5px solid ${EMAIL_BRAND.border};
                border-radius: 12px; padding: 22px; text-align: center; margin: 28px 0;">
      <span style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
                    font-size: 34px; font-weight: 800; letter-spacing: 10px; color: ${EMAIL_BRAND.text};">
        ${escapeHtml(code)}
      </span>
    </div>`;
}

/** A muted, smaller-print note — expiry/"ignore this if..." disclaimers. */
export function emailNote(html: string): string {
  return `<p style="margin: 20px 0 0; font-size: 13px; line-height: 20px; color: ${EMAIL_BRAND.textSecondary};">${html}</p>`;
}

/** Fallback plain-text link, shown under a button in case it doesn't render/click. */
export function emailLinkFallback(href: string): string {
  return `
    <p style="margin: 16px 0 0; font-size: 12px; line-height: 18px; color: ${EMAIL_BRAND.textTertiary}; word-break: break-all;">
      Or copy and paste this link into your browser:<br />
      <a href="${href}" target="_blank" style="color: ${EMAIL_BRAND.primary};">${href}</a>
    </p>`;
}

export interface EmailLayoutOptions {
  /** Hidden preview text shown next to the subject line in most inboxes. */
  preheader: string;
  bodyHtml: string;
}

export function renderEmailLayout({ preheader, bodyHtml }: EmailLayoutOptions): string {
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${EMAIL_BRAND.name}</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; background-color: ${EMAIL_BRAND.pageBackground}; }
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .email-padding { padding-left: 20px !important; padding-right: 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${EMAIL_BRAND.pageBackground}; font-family: ${EMAIL_BRAND.fontFamily};">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;">
    ${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${EMAIL_BRAND.pageBackground};">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0"
               style="width: 600px; max-width: 100%; background-color: ${EMAIL_BRAND.cardBackground}; border-radius: 16px; overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, ${EMAIL_BRAND.primary} 0%, ${EMAIL_BRAND.primaryDark} 100%); padding: 28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width: 40px; height: 40px; background-color: rgba(255,255,255,0.18); border-radius: 12px; text-align: center; vertical-align: middle;">
                    <span style="font-size: 20px; line-height: 40px;">💰</span>
                  </td>
                  <td style="padding-left: 12px; vertical-align: middle;">
                    <span style="font-size: 20px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.3px; font-family: ${EMAIL_BRAND.fontFamily};">
                      ${EMAIL_BRAND.name}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-padding" style="padding: 40px 32px 8px; font-family: ${EMAIL_BRAND.fontFamily}; color: ${EMAIL_BRAND.text};">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td class="email-padding" style="padding: 28px 32px 32px;">
              <hr style="border: none; border-top: 1px solid ${EMAIL_BRAND.border}; margin: 0 0 20px;" />
              <p style="margin: 0 0 6px; font-size: 12px; line-height: 18px; color: ${EMAIL_BRAND.textTertiary}; font-family: ${EMAIL_BRAND.fontFamily};">
                This is an automated message from ${EMAIL_BRAND.name} — please don't reply directly to this email.
              </p>
              <p style="margin: 0; font-size: 12px; color: ${EMAIL_BRAND.textTertiary}; font-family: ${EMAIL_BRAND.fontFamily};">
                © ${year} ${EMAIL_BRAND.name}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function emailHeading(text: string): string {
  return `<h1 style="margin: 0 0 12px; font-size: 22px; font-weight: 800; color: ${EMAIL_BRAND.text}; letter-spacing: -0.3px;">${escapeHtml(text)}</h1>`;
}

export function emailParagraph(html: string): string {
  return `<p style="margin: 0 0 4px; font-size: 15px; line-height: 24px; color: ${EMAIL_BRAND.textSecondary};">${html}</p>`;
}
