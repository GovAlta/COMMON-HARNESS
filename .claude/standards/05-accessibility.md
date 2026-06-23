# Accessibility Standard

All applications must meet **WCAG 2.1 Level AA** compliance. This standard is framework-agnostic and applies to any frontend stack.

---

## Component Library Strategy

Use a WCAG-compliant component library as the primary accessibility mechanism. A well-chosen library handles ARIA attributes, keyboard navigation, focus management, and screen reader support out of the box.

### Recommended Libraries

| Library | Framework | WCAG Level | Key Features |
|---------|-----------|------------|--------------|
| PrimeVue 4.x | Vue 3 | AA | Built-in ARIA, keyboard nav, focus management |
| Radix Vue | Vue 3 | AA | Unstyled, fully accessible primitives |
| Headless UI | Vue 3 / React | AA | Unstyled with keyboard and screen reader support |
| Radix UI | React | AA | Unstyled, composable accessible primitives |
| Ark UI | Vue / React / Solid | AA | State machine-driven, accessible by default |

Choose a library that provides accessible equivalents for native HTML elements. The specific library does not matter as long as it meets WCAG 2.1 AA requirements.

### Component Mapping

Never use raw native HTML elements when the chosen component library provides an accessible equivalent:

| Native HTML | Use Library Equivalent | Why |
|-------------|----------------------|-----|
| `<input type="text">` | Text input component | ARIA labels, error binding, validation states |
| `<input type="number">` | Number input component | Increment/decrement keyboard handling |
| `<textarea>` | Textarea component | Auto-resize, character count announcements |
| `<select>` | Select/dropdown component | Keyboard navigation, typeahead, ARIA listbox |
| `<table>` | Data table component | Sortable headers, pagination announcements, responsive modes |
| `<input type="checkbox">` | Checkbox component | Indeterminate state, group management |
| `<input type="radio">` | Radio button component | Arrow key navigation within group |
| `<input type="date">` | Date picker component | Keyboard-navigable calendar, screen reader dates |
| `<dialog>` | Dialog/modal component | Focus trap, escape handling, focus restoration |
| `<details>` | Accordion component | `aria-expanded`, animation, group management |
| Custom tabs | Tab component | `role="tablist"`, arrow key navigation |
| Custom menu | Menu component | `role="menu"`, typeahead, submenu support |
| Toast/alert | Toast/notification component | `aria-live` regions, auto-dismiss timers |
| Confirmation | Confirm dialog component | Focus trap, accessible action buttons |
| `<input type="file">` | File upload component | Drag-and-drop with keyboard alternative |

---

## Page Structure

### Skip Navigation

The first focusable element on every page must be a skip link to main content:

```html
<body>
  <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:p-2 focus:bg-white focus:text-black focus:underline">
    Skip to main content
  </a>
  <nav aria-label="Primary navigation">
    <!-- navigation links -->
  </nav>
  <main id="main-content" tabindex="-1">
    <!-- page content -->
  </main>
</body>
```

### Language Attribute

Always set the language on the root HTML element:

```html
<html lang="en">
```

For content in a different language than the page, set `lang` on the containing element:

```html
<p>The French word for hello is <span lang="fr">bonjour</span>.</p>
```

### Heading Hierarchy

- Exactly one `<h1>` per page, representing the page title
- Never skip heading levels (`<h1>` then `<h3>` is invalid)
- Headings must reflect the logical content structure

```html
<!-- Correct -->
<h1>User Management</h1>
  <h2>Active Users</h2>
    <h3>Administrators</h3>
    <h3>Standard Users</h3>
  <h2>Inactive Users</h2>

<!-- Incorrect: skipped h2 -->
<h1>User Management</h1>
  <h3>Administrators</h3>
```

### Semantic HTML and Landmarks

Use semantic elements to create document landmarks that assistive technology can traverse:

```html
<body>
  <header>
    <nav aria-label="Primary navigation">...</nav>
  </header>
  <aside aria-label="Sidebar navigation">...</aside>
  <main id="main-content">
    <article>
      <h1>Page Title</h1>
      <section aria-labelledby="section-heading">
        <h2 id="section-heading">Section Title</h2>
      </section>
    </article>
  </main>
  <footer>...</footer>
</body>
```

| Semantic Element | Landmark Role | When to Use |
|------------------|---------------|-------------|
| `<header>` | `banner` | Site-wide header (direct child of `<body>`) |
| `<nav>` | `navigation` | Navigation link groups |
| `<main>` | `main` | Primary page content (one per page) |
| `<aside>` | `complementary` | Sidebar, related content |
| `<footer>` | `contentinfo` | Site-wide footer (direct child of `<body>`) |
| `<section>` | `region` | Only when it has an accessible name (`aria-labelledby` or `aria-label`) |
| `<form>` | `form` | When it has an accessible name |

When a semantic element is not available, use `role` attributes:

```html
<div role="search" aria-label="Site search">
  <!-- search form -->
</div>
```

---

## Images and Icons

### Image Alt Text

Every `<img>` element must have an `alt` attribute:

```html
<!-- Informative image: describe what it conveys -->
<img src="chart.png" alt="Revenue increased 25 percent between Q1 and Q2 2025">

<!-- Decorative image: empty alt + aria-hidden -->
<img src="decorative-border.png" alt="" aria-hidden="true">

<!-- Image as link: alt describes the destination -->
<a href="/profile">
  <img src="avatar.jpg" alt="User profile">
</a>
```

### Icon Accessibility

```html
<!-- Icon with visible label: hide icon from screen readers -->
<button>
  <svg aria-hidden="true" focusable="false"><!-- icon path --></svg>
  <span>Delete</span>
</button>

<!-- Icon-only button: provide accessible name -->
<button aria-label="Delete item">
  <svg aria-hidden="true" focusable="false"><!-- icon path --></svg>
</button>

<!-- Standalone informational SVG -->
<svg role="img" aria-label="Warning: action cannot be undone">
  <!-- icon path -->
</svg>

<!-- Icon font (if unavoidable) -->
<span class="icon-trash" aria-hidden="true"></span>
<span class="sr-only">Delete</span>
```

---

## Keyboard Accessibility

### Requirements

- All interactive elements must be reachable via the Tab key
- Tab order must follow visual/logical reading order
- Visible focus indicators on every focusable element
- No keyboard traps (user can always Tab out, except modals with proper Escape handling)

### Focus Indicators

Every focusable element must have a visible focus style. Never remove outlines without providing an alternative:

```css
/* Base focus style for all interactive elements */
:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

/* Never do this without a replacement */
/* :focus { outline: none; } */
```

```css
/* Tailwind CSS equivalent */
.focus-ring {
  @apply focus:outline-2 focus:outline-offset-2 focus:outline-blue-600;
}
```

### Custom Interactive Elements

When building interactive elements from non-interactive HTML, provide full keyboard support:

```html
<!-- Custom clickable card -->
<div
  role="button"
  tabindex="0"
  @click="handleAction"
  @keydown.enter="handleAction"
  @keydown.space.prevent="handleAction"
>
  Card content
</div>
```

```html
<!-- Custom toggle -->
<div
  role="switch"
  tabindex="0"
  :aria-checked="isActive"
  @click="toggle"
  @keydown.enter="toggle"
  @keydown.space.prevent="toggle"
>
  <span class="sr-only">{{ isActive ? 'Enabled' : 'Disabled' }}</span>
</div>
```

### Keyboard Patterns by Component Type

| Component | Keys | Behavior |
|-----------|------|----------|
| Button | Enter, Space | Activate |
| Link | Enter | Follow link |
| Checkbox | Space | Toggle |
| Radio group | Arrow keys | Move selection |
| Tab list | Arrow keys | Switch tabs |
| Menu | Arrow keys, Enter, Escape | Move, select, close |
| Modal | Tab (trapped), Escape | Move within, close |
| Dropdown | Arrow keys, Enter, Escape | Move, select, close |
| Tree view | Arrow keys, Enter | Expand/collapse, select |
| Slider | Arrow keys | Adjust value |

---

## Forms

### Labels

Every form input must have an associated label:

```html
<!-- Explicit label association via for/id -->
<label for="email">Email address</label>
<input type="email" id="email" name="email">

<!-- Wrapping label (implicit association) -->
<label>
  Email address
  <input type="email" name="email">
</label>

<!-- aria-label for visually hidden labels (use sparingly) -->
<input type="search" aria-label="Search users" placeholder="Search...">
```

### Error Messages

Link error messages to their inputs using `aria-describedby`:

```html
<div>
  <label for="email">Email address</label>
  <input
    type="email"
    id="email"
    aria-describedby="email-error email-hint"
    aria-invalid="true"
    aria-required="true"
  >
  <p id="email-hint">We will never share your email.</p>
  <p id="email-error" role="alert">Please enter a valid email address.</p>
</div>
```

### Required Fields

Indicate required fields both visually and programmatically:

```html
<label for="name">
  Full name <span aria-hidden="true" class="text-red-600">*</span>
</label>
<input type="text" id="name" aria-required="true">
```

### Grouped Inputs

Use `<fieldset>` and `<legend>` for related input groups:

```html
<fieldset>
  <legend>Notification preferences</legend>
  <label>
    <input type="checkbox" name="notify-email"> Email notifications
  </label>
  <label>
    <input type="checkbox" name="notify-sms"> SMS notifications
  </label>
  <label>
    <input type="checkbox" name="notify-push"> Push notifications
  </label>
</fieldset>
```

### Form Submission

```html
<!-- Clear, descriptive submit button -->
<button type="submit">Create account</button>

<!-- Not accessible: ambiguous label -->
<!-- <button type="submit">Submit</button> -->

<!-- Disabled state communicated to assistive technology -->
<button type="submit" :disabled="!isValid" :aria-disabled="!isValid">
  Create account
</button>
```

---

## Dynamic Content

### Loading States

Announce loading states to screen readers using live regions:

```html
<div aria-live="polite" aria-atomic="true">
  <span v-if="loading">Loading users, please wait...</span>
  <span v-else-if="error">Error loading users. Please try again.</span>
  <span v-else>{{ users.length }} users loaded.</span>
</div>
```

### Toast and Notifications

```html
<!-- Status messages (non-urgent) -->
<div role="status" aria-live="polite">
  Profile saved successfully.
</div>

<!-- Alert messages (urgent, interrupts) -->
<div role="alert" aria-live="assertive">
  Session expired. Please log in again.
</div>
```

Use `aria-live="assertive"` sparingly -- only for time-sensitive errors. Default to `aria-live="polite"`.

### Modals and Dialogs

Modals must implement these behaviors (most component libraries handle this automatically):

```html
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
  aria-describedby="dialog-description"
>
  <h2 id="dialog-title">Confirm deletion</h2>
  <p id="dialog-description">This action cannot be undone. Are you sure?</p>
  <button @click="confirm">Delete</button>
  <button @click="cancel">Cancel</button>
</div>
```

Required modal behaviors:
1. **Focus trap**: Tab cycles only within the modal
2. **Initial focus**: First focusable element or the modal itself receives focus on open
3. **Escape to close**: Pressing Escape dismisses the modal
4. **Focus restoration**: Focus returns to the trigger element on close
5. **Background inert**: Content behind the modal is hidden from assistive technology (`aria-hidden="true"` on sibling elements or `inert` attribute)

### Expandable Content

```html
<button
  aria-expanded="false"
  aria-controls="details-panel"
  @click="togglePanel"
>
  Show details
</button>
<div id="details-panel" :hidden="!isPanelOpen">
  <!-- expandable content -->
</div>
```

### SPA Route Changes

Single-page applications must announce route changes to screen readers:

```typescript
// Vue Router example
router.afterEach((to) => {
  const announcement = document.getElementById('route-announcer')
  if (announcement) {
    announcement.textContent = `Navigated to ${to.meta.title || to.name}`
  }
})
```

```html
<!-- Live region for route announcements -->
<div id="route-announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>
```

### Chat and Streaming Content Accessibility

AI chat interfaces and streaming content have unique accessibility requirements:

#### Message Containers
- Use `role="log"` on the chat message container to indicate a chronological log of events
- The container should have `aria-label="Chat messages"` for screen reader context

#### Loading and Streaming States
- Announce loading states with `aria-live="polite"`: "AI is thinking..." or "Generating response..."
- Do not use `aria-live="assertive"` for streaming content updates, it would interrupt the user constantly
- Use `role="alert"` only for error messages within the chat interface

#### Interactive Elements
- All icon-only buttons (send, attach, clear) must have descriptive `aria-label` attributes
- Image upload buttons: `aria-label="Attach image"`
- Send button: `aria-label="Send message"`

#### Screen Reader Utility Class
Define `.sr-only` globally in the root component (`App.vue`) with focus variants for skip links:

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.sr-only:focus,
.sr-only:focus-within {
  position: static;
  width: auto;
  height: auto;
  overflow: visible;
  clip: auto;
  clip-path: none;
  white-space: normal;
}
```

---

## Color and Contrast

### Minimum Contrast Ratios (WCAG AA)

| Element | Minimum Ratio | Example |
|---------|---------------|---------|
| Normal text (< 18px or < 14px bold) | 4.5:1 | Body text, labels, links |
| Large text (>= 18px or >= 14px bold) | 3:1 | Headings, large buttons |
| UI components and graphical objects | 3:1 | Borders, icons, form controls |
| Focus indicators | 3:1 | Outline against background |

### Color Independence

Never use color as the sole means of conveying information:

```html
<!-- Incorrect: color alone indicates status -->
<span class="text-red-600">Error</span>
<span class="text-green-600">Success</span>

<!-- Correct: icon + text + color -->
<span class="text-red-600">
  <svg aria-hidden="true"><!-- error icon --></svg>
  Error: Email is required
</span>
<span class="text-green-600">
  <svg aria-hidden="true"><!-- check icon --></svg>
  Success: Profile saved
</span>
```

### Dark Mode

- Maintain equivalent contrast ratios in dark mode
- Use CSS custom properties or design tokens for theme-aware colors
- Test contrast in both light and dark themes

```css
:root {
  --color-text-primary: #1a1a1a;     /* 15.4:1 on white */
  --color-text-secondary: #525252;   /* 7.1:1 on white */
  --color-bg-primary: #ffffff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-text-primary: #f5f5f5;   /* 14.7:1 on #1a1a1a */
    --color-text-secondary: #a3a3a3; /* 7.2:1 on #1a1a1a */
    --color-bg-primary: #1a1a1a;
  }
}
```

### Reduced Motion

Respect the user's motion preference:

```css
/* Apply animations only when user has no preference */
@media (prefers-reduced-motion: no-preference) {
  .transition-element {
    transition: transform 0.3s ease, opacity 0.3s ease;
  }
}

/* Remove or minimize motion when preferred */
@media (prefers-reduced-motion: reduce) {
  .transition-element {
    transition: none;
  }

  .animate-spin {
    animation: none;
  }
}
```

### Font Loading Optimization

For design systems that depend on web fonts, optimize loading to prevent Flash of Invisible Text (FOIT):

#### Resource Hints
```html
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" href="https://fonts.googleapis.com/css2?family=..." as="style">
```

#### font-display: swap
Override all web font `@font-face` rules to use `font-display: swap`, which shows fallback text immediately and swaps to the web font once loaded:

```css
@font-face {
  font-family: 'acumin-pro-semi-condensed';
  font-display: swap;
  /* ... other properties */
}
```

#### Fallback Font Stacks
Specify fallback font stacks that visually approximate the design system fonts to minimize layout shift:

```css
body {
  font-family: 'acumin-pro-semi-condensed', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
```

This addresses WCAG 1.4.12 (Text Spacing) and improves perceived performance.

---

## Mobile Accessibility

### Touch Targets

All interactive elements must have a minimum touch target of 44x44 CSS pixels:

```css
button, a, [role="button"], input, select, textarea {
  min-height: 44px;
  min-width: 44px;
}

/* For inline links in text, give adequate spacing */
p a {
  padding: 4px 0;
  /* Touch target is supplemented by line-height */
}
```

### Viewport

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

Never set `maximum-scale=1` or `user-scalable=no` -- users must be able to zoom.

### Responsive Design

- No horizontal scrolling at 320px viewport width
- Content must be readable at 200% zoom
- Responsive layouts must maintain logical reading order

### Mobile Navigation

```html
<button
  aria-expanded="false"
  aria-controls="mobile-nav"
  aria-label="Menu"
  @click="toggleMenu"
>
  <svg aria-hidden="true"><!-- hamburger icon --></svg>
</button>
<nav id="mobile-nav" :hidden="!isMenuOpen" aria-label="Primary navigation">
  <ul>
    <li><a href="/dashboard">Dashboard</a></li>
    <li><a href="/settings">Settings</a></li>
  </ul>
</nav>
```

### Responsive Tables

Provide accessible alternatives for tables on small screens:

```html
<!-- Option 1: Horizontal scroll with announcement -->
<div role="region" aria-label="User data table" tabindex="0" class="overflow-x-auto">
  <table>
    <caption>Active users and their roles</caption>
    <!-- table content -->
  </table>
</div>

<!-- Option 2: Stacked layout on mobile -->
<!-- Use component library's responsive table mode or CSS-based stacking -->
```

---

## Screen Reader Support

### Visually Hidden Content

Use the `.sr-only` utility class for content visible only to screen readers:

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Make visible when focused (for skip links) */
.sr-only:focus,
.sr-only:focus-within {
  position: static;
  width: auto;
  height: auto;
  padding: inherit;
  margin: inherit;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
```

### Meaningful Link Text

```html
<!-- Incorrect: ambiguous out of context -->
<a href="/report">Click here</a>
<a href="/docs">Read more</a>

<!-- Correct: descriptive link text -->
<a href="/report">Download Q2 revenue report</a>
<a href="/docs">Read the API documentation</a>

<!-- Acceptable: visually short with screen reader context -->
<a href="/report">
  Download
  <span class="sr-only">Q2 revenue report</span>
</a>
```

### Live Regions

| Attribute | Value | Use Case |
|-----------|-------|----------|
| `aria-live` | `polite` | Non-urgent updates (search results count, save confirmation) |
| `aria-live` | `assertive` | Urgent alerts (session expiry, critical errors) |
| `aria-atomic` | `true` | Announce entire region content, not just changes |
| `aria-relevant` | `additions text` | Default; announce new content and text changes |
| `role` | `status` | Implicit `aria-live="polite"` |
| `role` | `alert` | Implicit `aria-live="assertive"` |

### Common ARIA Patterns

```html
<!-- Breadcrumb navigation -->
<nav aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Home</a></li>
    <li><a href="/users">Users</a></li>
    <li><a href="/users/123" aria-current="page">Jane Doe</a></li>
  </ol>
</nav>

<!-- Pagination -->
<nav aria-label="Pagination">
  <ul>
    <li><a href="?page=1" aria-label="Page 1">1</a></li>
    <li><a href="?page=2" aria-current="page" aria-label="Page 2, current page">2</a></li>
    <li><a href="?page=3" aria-label="Page 3">3</a></li>
  </ul>
</nav>

<!-- Sort indicators in tables -->
<th scope="col">
  <button aria-sort="ascending">
    Name
    <span class="sr-only">, sorted ascending</span>
  </button>
</th>

<!-- Progress indicator -->
<div role="progressbar" aria-valuenow="65" aria-valuemin="0" aria-valuemax="100" aria-label="Upload progress">
  65%
</div>
```

---

## Testing Accessibility

### Automated Testing

Integrate axe-core into your CI/CD pipeline:

```typescript
// Vitest + axe-core example
import { axe, toHaveNoViolations } from 'jest-axe'
import { mount } from '@vue/test-utils'
import UserForm from '../UserForm.vue'

expect.extend(toHaveNoViolations)

it('has no accessibility violations', async () => {
  const wrapper = mount(UserForm)
  const results = await axe(wrapper.element)
  expect(results).toHaveNoViolations()
})
```

```typescript
// Playwright + axe-core for end-to-end
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('homepage has no accessibility violations', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

### Manual Testing Checklist

| Test | Method | Pass Criteria |
|------|--------|---------------|
| Keyboard navigation | Tab through entire page | All interactive elements reachable in logical order |
| Focus visibility | Tab through page | Focus indicator visible on every focusable element |
| Screen reader | NVDA (Windows) or VoiceOver (macOS) | All content announced meaningfully |
| Heading structure | Browser devtools or extension | Logical hierarchy, no skipped levels, one h1 |
| Color contrast | Browser devtools or contrast checker | Meets minimum ratios per element type |
| Zoom | Browser zoom to 200% | Content readable, no horizontal scroll, no overlap |
| Form completion | Keyboard only | All forms completable without mouse |
| Modal focus | Open/close modals with keyboard | Focus trapped, escape closes, focus restored |
| Dynamic content | Trigger updates with screen reader on | Status changes announced |
| Mobile | Real device or responsive mode at 320px | Touch targets 44px, no horizontal scroll |
| Images | Review all images | Appropriate alt text or aria-hidden |
| Skip link | Tab on page load | Skip link visible on focus, jumps to main content |
| Error states | Submit invalid forms | Errors announced, linked to inputs |

### Recommended Tools

| Tool | Type | Purpose |
|------|------|---------|
| axe-core / jest-axe | Automated | CI/CD accessibility scanning |
| @axe-core/playwright | Automated | End-to-end accessibility testing |
| Lighthouse | Automated | Accessibility audit scoring (target >= 90) |
| WAVE | Browser extension | Visual accessibility evaluation |
| Accessibility Insights | Browser extension | Guided manual testing |
| NVDA | Screen reader | Windows screen reader testing (free) |
| VoiceOver | Screen reader | macOS/iOS screen reader testing (built-in) |
| Colour Contrast Analyser | Desktop app | Precise contrast ratio measurement |
| axe DevTools | Browser extension | In-browser accessibility analysis |

---

## Empty States

When a list, table, dashboard, or collection has no data:

- Provide an accessible empty state message that explains why the content is empty
- Offer a clear call-to-action where appropriate (e.g., "Create your first project")
- Empty states must not be blank or inaccessible regions
- Use an appropriate ARIA role (e.g., `role="status"`) so screen readers announce the absence of content
- Never show a loading skeleton indefinitely, transition to the empty state after loading completes

---

## Disabled Interactive Elements

When actions are unavailable (disabled buttons, grayed-out controls):

- Explain why the action is disabled rather than silently disabling or hiding it
- Use `aria-disabled="true"` with a visible explanation rather than the HTML `disabled` attribute alone, so the element remains discoverable by assistive technology
- Provide a tooltip, adjacent text, or `aria-describedby` reference explaining the condition that must be met to enable the action
- Never hide functionality without explanation; users should understand what they need to do to enable the action

---

## Multi-Step Form Progress

Multi-step forms (wizards, steppers) must:

- Announce the current step and total number of steps to screen readers (e.g., "Step 2 of 4")
- Announce step transitions via a live region
- Allow backward navigation to review and edit previous steps
- Preserve entered data when navigating between steps
- Indicate which steps are completed/current/upcoming using both visual and programmatic indicators

---

## Post-Submission Confirmation

After form submission:

- Confirmation messages and next-step information must be announced to screen readers
- Move focus to the confirmation content, or use a live region to announce the result
- Users must not be left on a page with no indication that their action succeeded or failed
- If the user is redirected, the destination page must clearly indicate the outcome

---

## Status Badges and Indicators

Status badges and indicators (success, warning, error, information, pending) must:

- Convey their meaning through text and/or ARIA labels, not color alone
- Each badge must have a text label that is programmatically associated with the status type
- Use appropriate ARIA roles where applicable (e.g., `role="status"` for dynamic updates)
- Meet the 3:1 minimum contrast ratio for UI components against their background

---

## Search and Filter Results

When a search or filter operation changes the visible content:

- Announce the number of results to screen readers via a live region (e.g., "12 results found" or "No results found")
- If filtering reduces results to zero, provide a clear message explaining why and suggest next steps (broaden search, clear filters)
- Maintain focus appropriately, do not move focus away from the search input during incremental filtering
- Ensure "clear filters" and "reset search" actions are keyboard accessible and clearly labeled
