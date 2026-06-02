# Markdown Rendering for AI Responses

## Goal

Render markdown in AI assistant chat bubbles so that bold, italic, inline code, code blocks, and bullet lists display correctly instead of showing raw syntax like `*text*` or `**text**`.

## Scope

- **Render markdown:** assistant messages only (both finalized history entries and the live streaming bubble)
- **Plain text unchanged:** user messages stay as-is with `whitespace-pre-wrap`

## Libraries

| Package | Version | Purpose |
|---|---|---|
| `react-markdown` | `^10` | Markdown → React component tree (no `dangerouslySetInnerHTML`) |
| `remark-gfm` | latest | GitHub Flavored Markdown: tables, strikethrough, task lists |
| `@tailwindcss/typography` | latest | Prose styles for Tailwind v4 (required — v4 preflight strips default element styles) |

**Why `@tailwindcss/typography`:** Tailwind v4's preflight CSS reset removes all default browser styling from `<code>`, `<ul>`, `<ol>`, `<h1>`–`<h6>`, etc. Without the typography plugin, markdown elements render as unstyled text. Custom component renderers are not used — the plugin is the proper solution.

**`react-markdown` v10 breaking change:** The `className` prop was removed. A wrapper `<div>` is used to apply classes instead.

## Implementation

### `frontend/src/index.css`

Add the typography plugin registration (Tailwind v4 CSS-based plugin syntax):

```css
@plugin "@tailwindcss/typography";
```

### `frontend/src/components/ChatView.tsx`

Extract a `MarkdownMessage` component at the top of the file:

```tsx
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  )
}
```

Replace plain text rendering in assistant bubbles:

```tsx
// before
{msg.content}

// after (assistant messages only)
<MarkdownMessage content={msg.content} />
```

Remove `whitespace-pre-wrap` from assistant bubbles (markdown handles whitespace). Keep it on user bubbles.

Replace plain text in the streaming bubble:

```tsx
// before
{streamingMessage}
<span className="animate-pulse ml-0.5">▌</span>

// after
<MarkdownMessage content={streamingMessage} />
<span className="animate-pulse ml-0.5">▌</span>
```

## Files Changed

| File | Change |
|---|---|
| `frontend/src/index.css` | Add `@plugin "@tailwindcss/typography"` |
| `frontend/src/components/ChatView.tsx` | Add `MarkdownMessage` component; use it for assistant bubbles and streaming bubble; remove `whitespace-pre-wrap` from assistant bubbles |

## Out of Scope

- Syntax highlighting for code blocks (no `rehype-highlight` or similar)
- Sanitizing HTML in markdown (AI responses don't contain HTML; `react-markdown` does not render raw HTML by default)
- User message rendering
