'use client';
import DOMPurify from 'dompurify';

export function HtmlBody({ html }: { html: string }) {
  const safe = DOMPurify.sanitize(html);
  return (
    <div
      className="prose prose-invert max-w-none text-sm"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
