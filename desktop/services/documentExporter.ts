import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function renderMarkdownDocumentHtml(params: {
  title: string;
  markdown: string;
}): string {
  const content = renderToStaticMarkup(
    React.createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm],
      children: params.markdown,
    }),
  );

  const escapedTitle = params.title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <style>
      :root {
        color-scheme: light;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        color: #111827;
        background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
      }
      .page {
        max-width: 860px;
        margin: 0 auto;
        padding: 48px 40px 64px;
      }
      .document {
        background: #ffffff;
        border: 1px solid #dbe4ff;
        border-radius: 24px;
        padding: 40px;
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
      }
      h1, h2, h3, h4 {
        color: #0f172a;
        line-height: 1.2;
      }
      h1 {
        font-size: 2rem;
        margin: 0 0 1.2rem;
      }
      h2 {
        margin-top: 2rem;
        font-size: 1.2rem;
      }
      h3 {
        margin-top: 1.4rem;
        font-size: 1rem;
      }
      p, li, blockquote {
        font-size: 0.97rem;
        line-height: 1.65;
      }
      ul, ol {
        padding-left: 1.3rem;
      }
      blockquote {
        margin: 1rem 0;
        padding: 0.8rem 1rem;
        border-left: 4px solid #93c5fd;
        background: #eff6ff;
      }
      code {
        font-family: "Cascadia Code", "Consolas", monospace;
        background: #eff1f5;
        padding: 0.12rem 0.35rem;
        border-radius: 0.35rem;
      }
      pre {
        overflow: auto;
        background: #0f172a;
        color: #e2e8f0;
        padding: 1rem;
        border-radius: 0.8rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 1rem 0;
      }
      th, td {
        border: 1px solid #dbe4ff;
        padding: 0.6rem 0.75rem;
        text-align: left;
      }
      th {
        background: #eff6ff;
      }
      @media print {
        body {
          background: #ffffff;
        }
        .page {
          max-width: none;
          padding: 0;
        }
        .document {
          border: none;
          box-shadow: none;
          border-radius: 0;
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <main class="document">${content}</main>
    </div>
  </body>
</html>`;
}
