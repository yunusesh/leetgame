---
name: Tailwind CSS Conversion Design
description: Convert leetgame frontend from inline styles to Tailwind CSS v4 with custom theme
type: project
---

# Tailwind CSS Conversion Design

## Overview
Convert the leetgame React frontend from inline styles to Tailwind CSS v4, following the patterns established in go-chat.

## Current State
- React 19 + Vite + TypeScript
- All styles inline via `style={{ ... }}` props
- CSS variables in `index.css` for theming
- Dark mode support via `prefers-color-scheme`
- ~420 lines of code across 6 files

## Target State
- Tailwind CSS v4 via Vite plugin
- Custom theme configuration matching current design
- Utility-first CSS approach
- Maintain dark mode support

## Technical Implementation

### Dependencies
```json
{
  "@tailwindcss/vite": "^4.1.11",
  "tailwindcss": "^4.1.11",
  "tw-animate-css": "^1.3.5",
  "clsx": "^2.1.1",
  "tailwind-merge": "^3.3.1"
}
```

### Vite Configuration
```typescript
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

### Theme Mapping

| Current CSS Variable | Tailwind Token | Purpose |
|---------------------|----------------|---------|
| `--text: #6b6375` | `text-muted-foreground` | Secondary text |
| `--text-h: #08060d` | `text-foreground` | Primary text |
| `--bg: #fff` | `bg-background` | Page background |
| `--border: #e5e4e7` | `border-border` | Border color |
| `--code-bg: #f4f3ec` | `bg-muted` | Code block background |
| `--accent: #aa3bff` | `text-primary` | Accent color |
| `--accent-bg: rgba(170, 59, 255, 0.1)` | `bg-primary/10` | Accent background |
| `--sans` | `font-sans` | Font family |
| `--mono` | `font-mono` | Monospace font |

### Dark Mode Strategy
Use Tailwind's dark mode with `.dark` class, configured via:
```css
@custom-variant dark (&:is(.dark *));
```

### Color Mapping
- Easy difficulty: `#00b8a9` → `text-green-500`
- Medium difficulty: `#ffc01e` → `text-yellow-500`
- Hard difficulty: `#ff375f` → `text-red-500`

### Component Conversion Examples

**ProblemView.tsx:**
```tsx
// Before
<div style={{ width: '50%', overflowY: 'auto', padding: '24px' }}>

// After
<div className="w-1/2 overflow-y-auto p-6">
```

**ChatView.tsx:**
```tsx
// Before
<div style={{ 
  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
  maxWidth: '80%',
  padding: '10px 14px',
  borderRadius: '12px',
  background: msg.role === 'user' ? '#0070f3' : '#f0f0f0',
}}>

// After
<div className={cn(
  'self-end max-w-[80%] px-3.5 py-2.5 rounded-xl',
  msg.role === 'user' 
    ? 'bg-blue-500 text-white' 
    : 'bg-gray-100 text-gray-900'
)}>
```

### Utility Functions
Create `frontend/src/lib/utils.ts` for className merging:
```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## Implementation Steps

1. **Setup** - Install dependencies, configure Vite
2. **Theme Configuration** - Create `index.css` with Tailwind imports and custom theme
3. **Convert App.tsx** - Main layout and error states
4. **Convert ProblemView.tsx** - Problem display, skip button, topic tags
5. **Convert ChatView.tsx** - Chat messages, input form, stage banner
6. **Convert CompleteView.tsx** - Completion screen
7. **Testing** - Verify all states and dark mode

## Success Criteria
- All inline styles replaced with Tailwind classes
- Visual appearance matches current design
- Dark mode works correctly
- No visual regressions
- Build and dev server work properly

## Files to Modify
- `frontend/package.json` - Add dependencies
- `frontend/vite.config.ts` - Add Tailwind plugin
- `frontend/src/index.css` - Replace with Tailwind setup
- `frontend/src/App.tsx` - Convert to utility classes
- `frontend/src/components/*.tsx` - Convert all components
- `frontend/src/lib/utils.ts` - Create utility functions (new)

## Risks & Mitigation
- **Risk**: Breaking existing styling during conversion
- **Mitigation**: Convert components one at a time, test frequently
- **Risk**: Dark mode not working correctly
- **Mitigation**: Test both light and dark themes after each component