import sanitizeHtml from 'sanitize-html';

// Shared by both readers; sanitize old records too, not only editor submissions.
export function sanitizeChapter(content: string): string {
  return sanitizeHtml(content, {
    allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'ul', 'ol', 'li', 'hr', 'pre', 'code', 'a'],
    allowedAttributes: { a: ['href', 'title'], ol: ['start'], p: [{ name: 'data-preserve-breaks', values: ['true'] }] },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
  });
}
