# DooSplit — Desktop Dashboard UI/UX LLM Prompt
> Feed this file to any LLM to generate or fix the desktop version of DooSplit's dashboard layout.

---

## 🎯 Core Problem Being Solved

The original desktop layout had these **UX bugs** — fix all of them:

| Bug | Root Cause | Fix |
|---|---|---|
| Brand name "Do..." is truncated | Sidebar top area shared with search/theme/notif icons — not enough space | Move search/theme/notif to the **top navbar** of main content area |
| Search, theme toggle, notification cramped in top-left | Sidebar ≠ place for utility controls | These 3 controls belong in the **top right of the topbar** |
| No visual hierarchy in sidebar | All items same weight | Add section labels, active indicator, nav badge |
| Sidebar has no tagline/identity | Brand feels generic | Add "Expense Tracker" tagline under DooSplit name |

---

## 🏗️ Correct Layout Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  SIDEBAR (260px fixed)     │  MAIN CONTENT (flex: 1)         │
│  ─────────────────────     │  ──────────────────────────     │
│                            │  TOPBAR (68px height)           │
│  [DS] DooSplit             │  Left: Page title + breadcrumb  │
│       Expense Tracker      │  Right: [Search][☀][🔔][|][AS] │
│  ─────────────────────     │  ──────────────────────────     │
│  [+ Add Expense]  ← CTA    │                                 │
│                            │  SCROLLABLE CONTENT             │
│  ── Main ──                │  • Greeting header              │
│  Dashboard  ← active       │  • Hero balance card            │
│  Expenses   [3]            │  • Stats row (3 cards)          │
│  Friends                   │  • Bottom 2-col grid            │
│  Groups                    │    (Top Balances | Activity)    │
│                            │                                 │
│  ── Finance ──             │                                 │
│  Settlements               │                                 │
│  Analytics                 │                                 │
│                            │                                 │
│  ── Other ──               │                                 │
│  Activity                  │                                 │
│  Invite Friends            │                                 │
│  Settings                  │                                 │
│  ─────────────────────     │                                 │
│  [AS] Abhishek Singh  >    │                                 │
│       abhishek@gmail.com   │  [Suggest Feature] ← fixed btn │
└──────────────────────────────────────────────────────────────┘
```

**Rule:** The sidebar contains ONLY: brand, add-expense CTA, navigation items, and user profile. It NEVER contains search, theme toggle, or notification bell.

---

## 🎨 Design System

```css
/* ── FONTS ── */
/* Headings/Brand  → Syne (700, 800) */
/* Body/Nav/Labels → DM Sans (400, 500, 600) */
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');

/* ── SIZE TOKENS ── */
--sidebar-w:  260px;
--topbar-h:   68px;
--radius:     16px;
--radius-sm:  10px;
--radius-xs:  8px;
--trans:      0.2s cubic-bezier(.4,0,.2,1);

/* ── BRAND COLORS ── */
--teal:       #00C9A7;
--teal-dark:  #007A65;
--teal-glow:  rgba(0,201,167,0.15);
--coral:      #FF5C5C;
--green:      #22C55E;

/* ── DARK MODE ── */
[data-theme="dark"] {
  --bg:             #0B1622;
  --bg2:            #0F1D2E;
  --sidebar-bg:     #0D1929;        /* sidebar always dark */
  --sidebar-border: rgba(255,255,255,0.06);
  --topbar-bg:      rgba(11,22,34,0.85);
  --card:           #132030;
  --card2:          #172537;
  --card-border:    rgba(255,255,255,0.06);
  --input-bg:       #0F1D2E;
  --border:         rgba(255,255,255,0.07);
  --text:           #EEF2F7;
  --text-soft:      rgba(238,242,247,0.6);
  --text-muted:     rgba(238,242,247,0.35);
  --nav-hover:      rgba(0,201,167,0.08);
  --nav-active:     rgba(0,201,167,0.12);
  --icon-btn:       rgba(255,255,255,0.06);
  --icon-hover:     rgba(0,201,167,0.12);
  --shadow:         0 4px 24px rgba(0,0,0,0.3);
}

/* ── LIGHT MODE ── */
/* NOTE: Sidebar stays dark navy even in light mode — intentional brand decision */
[data-theme="light"] {
  --bg:             #F5F4F0;
  --topbar-bg:      rgba(245,244,240,0.92);
  --card:           #FFFFFF;
  --card2:          #F8F7F5;
  --card-border:    rgba(13,27,42,0.08);
  --input-bg:       #F0EFEC;
  --border:         rgba(13,27,42,0.08);
  --text:           #0D1B2A;
  --text-soft:      rgba(13,27,42,0.6);
  --text-muted:     rgba(13,27,42,0.35);
  --icon-btn:       rgba(13,27,42,0.06);
  --icon-hover:     rgba(0,201,167,0.1);
  --shadow:         0 4px 24px rgba(13,27,42,0.08);
  /* sidebar-bg stays #0D1929 — DO NOT change in light mode */
}
```

---

## 🧩 Component Specs

### 1. App Shell (outermost wrapper)
```css
.app-shell {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  height: 100vh;
  overflow: hidden;
}
```

---

### 2. Sidebar — Full Spec

```
Background:   var(--sidebar-bg) = #0D1929 (ALWAYS dark, even in light mode)
Border-right: 1px solid var(--sidebar-border)
Height:       100vh
Display:      flex, flex-direction column
Overflow:     hidden

Decorative: ::before pseudo-element
  position absolute, top-left corner
  200×200px radial gradient blob, rgba(0,201,167,0.10), blur 0
  pointer-events: none
```

**2a. Sidebar Brand (top section)**
```
Height:         var(--topbar-h) = 68px   ← MUST match topbar height exactly
Border-bottom:  1px solid var(--sidebar-border)
Padding:        0 20px
Display:        flex, align-items center, gap 12px

Logo box:
  48×48px not — use 38×38px, border-radius 12px
  background: linear-gradient(135deg, #00C9A7, #007A65)
  box-shadow: 0 4px 14px rgba(0,201,167,0.35)
  Text: "DS", Syne 800, 15px, #fff

Brand text (column):
  "DooSplit"        → Syne 800, 18px, #fff, letter-spacing -0.3px
  "Expense Tracker" → DM Sans 500, 10px, rgba(255,255,255,0.35), uppercase, letter-spacing 0.5px
```

**2b. Add Expense CTA**
```
Padding: 16px 16px 8px
Full-width button, border-radius var(--radius-sm)
bg: linear-gradient(135deg, #00C9A7, #00b896)
Text: "+" icon + "Add Expense", Syne 700, 13px, #fff
box-shadow: 0 4px 16px rgba(0,201,167,0.3)
:hover → translateY(-1px), heavier shadow
```

**2c. Nav Sections**
```
3 labeled sections: "Main" | "Finance" | "Other"
Section label: DM Sans 600, 10px, uppercase, letter-spacing 1.2px
               color rgba(255,255,255,0.25), padding 12px 8px 6px

Nav item base:
  padding: 10px 12px, border-radius var(--radius-xs)
  color: rgba(255,255,255,0.55), DM Sans 500, 14px
  icon: 18×18px SVG, flex-shrink 0
  gap: 11px between icon and text
  :hover → background var(--nav-hover), color rgba(255,255,255,0.85)

Active state:
  background: var(--nav-active) = rgba(0,201,167,0.12)
  color: var(--teal)
  font-weight: 600
  left accent bar: ::before, position absolute, left 0, top 20%, bottom 20%
                   width 3px, border-radius 0 3px 3px 0, background var(--teal)
                   (requires parent position: relative, margin-left -12px on ::before)

Nav badge (for Expenses):
  margin-left auto, background var(--coral), color #fff
  font-size 10px, font-weight 700, padding 2px 6px, border-radius 99px

Nav items to include (in order):
  Main:    Dashboard (active), Expenses [badge:3], Friends, Groups
  Finance: Settlements, Analytics
  Other:   Activity, Invite Friends, Settings
```

**2d. Sidebar User Profile (bottom)**
```
margin-top: auto (pushes to bottom)
padding: 12px 16px
border-top: 1px solid var(--sidebar-border)
display: flex, align-items center, gap 10px
cursor: pointer
:hover → background var(--nav-hover)

Avatar: 36×36px, border-radius 11px
  bg: linear-gradient(135deg, var(--teal), #007A65)
  Text: initials "AS", Syne 700, 14px, #fff

Info column:
  Name:  DM Sans 600, 13px, rgba(255,255,255,0.85), truncated
  Email: DM Sans 400, 11px, rgba(255,255,255,0.35), truncated

Chevron: 14×14px SVG, rgba(255,255,255,0.25), margin-left auto
```

---

### 3. Top Navbar (inside main content, NOT sidebar)

```
Height:     var(--topbar-h) = 68px   ← MUST align with sidebar brand height
Background: var(--topbar-bg) with backdrop-filter: blur(12px)
Border-bottom: 1px solid var(--border)
Padding:    0 28px
Display:    flex, justify-content space-between, align-items center
Position:   sticky top 0, z-index 40
Flex-shrink: 0

LEFT side:
  Page title:     Syne 700, 20px, var(--text), letter-spacing -0.3px
  Page breadcrumb: DM Sans 400, 12px, var(--text-muted), margin-top 1px
  → "Dashboard" / "April 2026 — expense summary"

RIGHT side (flex row, gap 6px):
  [1] Search bar (expands on focus)
  [2] Divider (1px × 24px, var(--border))
  [3] Theme toggle icon button
  [4] Notification icon button (with red dot)
  [5] Divider
  [6] Avatar (38×38px, same as sidebar avatar but smaller border)
```

**Search bar in topbar:**
```css
.topbar-search {
  display: flex; align-items: center; gap: 8px;
  background: var(--input-bg);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  width: 220px;
  transition: width 0.3s ease, border-color var(--trans);
}
.topbar-search:focus-within {
  width: 280px;
  border-color: var(--teal);
  box-shadow: 0 0 0 3px var(--teal-glow);
}
/* SVG icon: 15×15px, var(--text-muted) */
/* Input: DM Sans 13px, no border/outline, bg transparent, full width */
/* Placeholder: var(--text-muted) */
/* placeholder text: "Search expenses, friends…" */
```

**Icon buttons (theme + notification):**
```css
.icon-btn {
  width: 38px; height: 38px;
  border-radius: var(--radius-xs);
  background: var(--icon-btn);
  border: 1px solid var(--border);
  cursor: pointer; color: var(--text-soft);
  transition: all var(--trans);
}
.icon-btn:hover {
  background: var(--icon-hover);
  color: var(--teal);
  border-color: var(--teal);
}

/* Notification dot */
.notif-dot::after {
  content: '';
  position: absolute; top: 7px; right: 7px;
  width: 7px; height: 7px;
  background: var(--coral);
  border-radius: 50%;
  border: 2px solid var(--bg);
}

/* Theme toggle: show moon SVG in dark, sun SVG in light */
[data-theme="dark"]  .icon-sun  { display: none; }
[data-theme="dark"]  .icon-moon { display: block; }
[data-theme="light"] .icon-moon { display: none; }
[data-theme="light"] .icon-sun  { display: block; }
```

---

### 4. Hero Balance Card

```
Background: linear-gradient(135deg, #0D1929 0%, #132A40 60%, #0F2235 100%)
            (always dark gradient regardless of theme)
Border-radius: 20px, padding 28px, margin-bottom 20px
::before: radial teal glow, top-right, 280×280px, 12% opacity

Layout:
  Top row: flex space-between
    Left: "Total Balance" label (12px, uppercase, rgba(255,255,255,0.4))
          + "₹0.00" amount (Syne 800, 48px, #fff, ₹ symbol smaller 28px, 60% opacity)
    Right: trend badge — "+12% this month" in green

  Bottom: 2-column grid (1fr 1fr), gap 12px
    Each pill: rgba(255,255,255,0.05) bg, 1px border rgba(255,255,255,0.08)
               border-radius 14px, padding 16px 18px
    Label: 11px, uppercase, with colored dot (6×6px circle)
    Amount: Syne 700, 24px
      "You Owe"    → #FF8585 (light coral)
      "You're Owed" → var(--teal)
```

---

### 5. Stats Row (3 cards)

```css
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

/* Each card */
.stat-card {
  background: var(--card);
  border: 1px solid var(--card-border);
  border-radius: var(--radius);
  padding: 20px;
  display: flex; align-items: center; gap: 14px;
  cursor: pointer;
  transition: all var(--trans);
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
  border-color: var(--teal);
}

/* Icon box: 46×46px, border-radius 14px */
/* This Month → teal bg  rgba(0,201,167,0.12) + calendar emoji */
/* Groups     → amber bg rgba(255,179,71,0.12) + group emoji */
/* Friends    → blue bg  rgba(96,165,250,0.12) + handshake emoji */

/* Value: Syne 800, 26px, var(--text) */
/* Label: DM Sans 500, 12px, uppercase, var(--text-muted) */
/* Arrow: 30×30px icon box, right side, shows teal on card hover */
```

---

### 6. Bottom 2-Column Grid

```css
.bottom-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

/* Panel card */
background: var(--card), border: 1px solid var(--card-border)
border-radius: var(--radius), padding: 22px

/* Panel header: flex space-between */
Title: Syne 700, 16px
Link btn: DM Sans 600, 12px, color teal, bg var(--teal-glow)
          border-radius 6px, padding 4px 10px
          :hover → bg teal, color #fff
```

**Balance row item:**
```
flex row, align-items center, gap 12px
padding: 11px 4px, border-bottom: 1px var(--border)
:hover → background var(--card2), border-radius var(--radius-xs)

Avatar: 38×38px, border-radius 12px, Syne 700, 14px, #fff
  color varies by person (teal/coral/amber gradient pairs)
Name:  DM Sans 600, 14px, var(--text)
Email: DM Sans 400, 11px, var(--text-muted)
Amount: Syne 700, 15px, right-aligned
  positive (+) → var(--teal)
  negative (−) → var(--coral)
```

**Activity feed item:**
```
flex row, gap 12px, padding 10px 0, border-bottom 1px var(--border)
Icon: 36×36px, border-radius 10px, emoji inside
Text: DM Sans 400, 13px, var(--text-soft) — <strong> = var(--text)
Time: DM Sans 400, 11px, var(--text-muted)
:hover .activity-icon → bg var(--teal-glow), color var(--teal)
```

---

### 7. Suggest Feature Button (Fixed)

```css
position: fixed; bottom: 28px; right: 28px; z-index: 999;
background: linear-gradient(135deg, var(--teal), #00b896);
color: #fff; border-radius: var(--radius-sm);
padding: 11px 18px;
font: Syne 700, 13px;
box-shadow: 0 6px 20px rgba(0,201,167,0.35);
:hover → translateY(-2px), heavier shadow
icon: chat-bubble SVG 15×15px left of text
```

---

## 🔧 JavaScript

```javascript
// Theme toggle — called by theme icon button onclick
function toggleTheme() {
  const html = document.documentElement;
  html.setAttribute('data-theme',
    html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  );
}

// Default theme: data-theme="dark" on <html> tag
```

---

## 🎬 Animations

```css
/* All dashboard sections entrance */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Stagger delays */
.page-header  { animation: fadeUp 0.5s ease 0.0s both; }
.hero-card    { animation: fadeUp 0.5s ease 0.05s both; }
.stat-card:nth-child(1) { animation: fadeUp 0.5s ease 0.10s both; }
.stat-card:nth-child(2) { animation: fadeUp 0.5s ease 0.15s both; }
.stat-card:nth-child(3) { animation: fadeUp 0.5s ease 0.20s both; }
.panel-card   { animation: fadeUp 0.5s ease 0.25s both; }
```

---

## ✅ Acceptance Criteria

**Sidebar:**
- [ ] Full brand name "DooSplit" + tagline "Expense Tracker" always visible — never truncated
- [ ] No search bar, theme toggle, or notification bell inside sidebar
- [ ] Sidebar bg is always dark navy (`#0D1929`) in BOTH dark and light mode
- [ ] 3 navigation sections with uppercase labels: Main / Finance / Other
- [ ] Active nav item has teal text + left accent bar + teal background tint
- [ ] "Expenses" nav item has red badge with count
- [ ] Sidebar brand height = topbar height = 68px (perfect horizontal alignment)
- [ ] User profile at very bottom: avatar + name + email + chevron
- [ ] Sidebar does NOT scroll independently (or scrolls only the nav section)

**Top Navbar:**
- [ ] Search bar in top-RIGHT of topbar — NOT in sidebar
- [ ] Theme toggle icon in top-right — NOT in sidebar
- [ ] Notification bell with red dot in top-right — NOT in sidebar
- [ ] Search bar expands (220px → 280px) on focus with teal glow
- [ ] Theme toggle switches between moon/sun SVG correctly
- [ ] Page title left-aligned, breadcrumb below it
- [ ] Topbar has backdrop blur (glassmorphism) effect
- [ ] Topbar height aligns with sidebar brand area (both 68px)

**Dashboard Content:**
- [ ] Hero balance card always uses dark gradient (even in light mode)
- [ ] "You Owe" amount is coral/red, "You're Owed" is teal — never swapped
- [ ] Stats row uses 3-column grid on desktop
- [ ] Bottom grid is 2 columns: Top Balances (left) + Recent Activity (right)
- [ ] Positive balance values → teal, negative → coral
- [ ] All cards have hover lift animation (translateY -2px)
- [ ] Staggered fadeUp entrance animation for all sections
- [ ] Suggest Feature button fixed bottom-right, above all content

**Theme:**
- [ ] Dark mode default (`data-theme="dark"` on `<html>`)
- [ ] Smooth CSS transition on theme switch (0.2s)
- [ ] All `var()` tokens update correctly — no hardcoded colors in main content

---

## 💡 LLM Build Order

**Step 1:** Generate CSS tokens + reset + app shell grid
> "Generate the CSS design tokens for both dark/light modes, reset styles, and the 2-column app-shell grid layout."

**Step 2:** Generate sidebar
> "Generate the sidebar with: brand (logo + DooSplit + tagline), add-expense CTA button, 3-section nav with active states and badge, user profile footer."

**Step 3:** Generate topbar
> "Generate the top navbar for the main content area with: page title left, search bar + divider + theme toggle + notification bell + avatar right."

**Step 4:** Generate dashboard content
> "Generate the dashboard content: greeting header, hero balance card (dark gradient, 2 pills), 3-column stats row, 2-column bottom grid (balances panel + activity feed)."

**Step 5:** Add animations + theme JS
> "Add the fadeUp staggered entrance animations, theme toggle JS function, and suggest-feature fixed button."

**Step 6:** Verify
> "Review against the Acceptance Criteria and fix any sidebar/topbar placement issues."

---

*Part of DooSplit Design System — consistent with mobile dashboard, Friends screen, and auth pages (navy/teal/coral on dark/cream).*