/**
 * Smoke-tests the sanitize-html configuration used in inbox/[id]/page.tsx.
 * Run with: node test/sanitize.test.mjs
 */
import sanitizeHtml from 'sanitize-html';
import assert from 'assert/strict';

const EMAIL_SANITIZE_OPTIONS = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img', 'figure', 'figcaption', 'picture', 'source',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'caption', 'colgroup', 'col',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'details', 'summary',
    'span', 'div', 'section', 'article', 'header', 'footer', 'main',
    'font', 'center',
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    '*': ['style', 'class', 'id', 'align', 'valign', 'bgcolor', 'width', 'height', 'border', 'cellpadding', 'cellspacing'],
    'a': ['href', 'target', 'rel', 'name'],
    'img': ['src', 'alt', 'title', 'width', 'height', 'style'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan', 'scope'],
    'font': ['color', 'size', 'face'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'cid'],
  transformTags: {
    a: (_tagName, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
    }),
  },
};

function clean(html) {
  return sanitizeHtml(html, EMAIL_SANITIZE_OPTIONS);
}

let passed = 0;

// 1. XSS: script tags stripped
{
  const out = clean('<p>Hello</p><script>alert(1)</script>');
  assert.ok(!out.includes('<script'), 'script tag must be stripped');
  assert.ok(out.includes('Hello'), 'safe content preserved');
  passed++;
}

// 2. XSS: onerror attr stripped
{
  const out = clean('<img src="x" onerror="alert(1)">');
  assert.ok(!out.includes('onerror'), 'onerror attr must be stripped');
  assert.ok(out.includes('<img'), 'img tag preserved');
  passed++;
}

// 3. XSS: javascript: href stripped
{
  const out = clean('<a href="javascript:alert(1)">click</a>');
  assert.ok(!out.includes('javascript:'), 'javascript: href must be stripped');
  assert.ok(out.includes('click'), 'link text preserved');
  passed++;
}

// 4. Tab hijacking: target forced to _blank + rel added
{
  const out = clean('<a href="https://example.com">link</a>');
  assert.ok(out.includes('target="_blank"'), 'target=_blank must be added');
  assert.ok(out.includes('rel="noopener noreferrer"'), 'rel must be added');
  passed++;
}

// 5. Legitimate email HTML preserved
{
  const html = '<table><tr><td bgcolor="#ffffff" style="padding:10px"><img src="cid:logo" alt="logo" width="200"></td></tr></table>';
  const out = clean(html);
  assert.ok(out.includes('<table>'), 'table preserved');
  assert.ok(out.includes('bgcolor="#ffffff"'), 'bgcolor preserved');
  assert.ok(out.includes('cid:logo'), 'cid: scheme allowed');
  passed++;
}

// 6. Heading tags preserved
{
  const out = clean('<h1>Hello</h1><h2>World</h2>');
  assert.ok(out.includes('<h1>') && out.includes('<h2>'), 'headings preserved');
  passed++;
}

console.log(`sanitize tests: ${passed}/6 passed`);
