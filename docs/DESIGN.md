# Design standard for the web screens
Written at step D.0 (D-125, A-300). Phase D carries it out, one screen per step. It replaces the prototype look (D-79) for the look only: every screen keeps its fields, labels, buttons and rules.

## 1. Direction
A calm, plain look that suits a finance office. People will trust it with money records.
- White work areas on a light grey page. Thin borders and small shadows. Square-ish corners (6 to 8 px), not round bubbles.
- The cooperative's green stays as the one brand colour. It is used for the side menu, main buttons and the active item. Everything else is grey.
- Red is used only for danger and errors. Amber is used only for warnings (for example "On loan").
- Numbers come first. Money is right-aligned in tables and uses figures of equal width, so columns line up.
- Each screen has the same parts in the same order: page header, filters, summary, table or form.

## 2. Limits we must keep
| Limit | Why | Effect on the design |
|---|---|---|
| The page CSP is `default-src 'none'; style-src 'self'` and has no `font-src` (D-120) | MDN: a missing `font-src` falls back to `default-src`; `'none'` loads nothing. Inline `style="..."` and `<style>` are blocked without `'unsafe-inline'`, a nonce or a hash (A-300 item 2) | No web fonts and no font files. We use the system font stack. No `style=` in the TSX; every rule goes in `web/src/styles.css`. |
| No new dependency without the owner's word (CLAUDE.md) | | Plain CSS. No Tailwind, no UI kit, no chart library, no icon font. Icons, if any, are inline SVG in the TSX. |
| The screen tests find things by text and role (`web/test/app.test.tsx`; 244 lines match `grep -cE '^ {2,4}it\('` at D.6, A-307 item 3) | | Labels, button names, headings and roles stay the same unless a step says otherwise and changes the tests too. |
| The browser does no money sums (A-18) | | The design shows only figures the server sends. No new totals and no charts that need sums. |
| WCAG 2.2 AA (R-39; read at D.0, A-300 item 1) | | See section 4. |

## 3. Tokens (CSS custom properties on `:root` in `styles.css`)
Every colour, size and space in `styles.css` comes from these. No hex codes outside `:root`.

### Colour
| Token | Value | Use |
|---|---|---|
| `--page` | `#f4f6f5` | page background |
| `--surface` | `#ffffff` | cards, panels, tables, forms |
| `--surface-muted` | `#f8fafc` | table head, quiet areas |
| `--border` | `#e2e8f0` | card and table lines (decoration only) |
| `--border-input` | `#7c8a9e` | input, select and checkbox borders (3.51:1 on white) |
| `--text` | `#0f172a` | main text |
| `--text-muted` | `#475569` | labels, notes, column heads |
| `--primary` | `#065f46` | main button, links, active marks |
| `--primary-hover` | `#064e3b` | main button hover |
| `--primary-soft` | `#ecfdf5` | soft green backgrounds (badges, notices) |
| `--focus` | `#047857` | focus ring on light areas |
| `--sidebar` | `#052e23` | side menu background |
| `--sidebar-text` | `#d1fae5` | side menu text |
| `--sidebar-muted` | `#a7c4b8` | side menu group names |
| `--sidebar-active` | `#0b4a38` | active menu item |
| `--sidebar-focus` | `#6ee7b7` | focus ring in the side menu |
| `--danger` | `#b42318` | errors, danger buttons |
| `--danger-soft` | `#fef3f2` | error notice background |
| `--warning` | `#9a3412` | warning text (On loan) |
| `--warning-soft` | `#fff7ed` | warning background |
| `--neutral-badge` | `#374151` | Inactive and other neutral badges (text) |
| `--neutral-badge-bg` | `#f1f5f9` | neutral badge background (split from `--neutral-badge` at D.1, A-301) |

### Type
System font stack: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Body text 14 px with line height 1.5. Sizes: 12 (column heads, badges), 13 (notes, table cells), 14 (body, inputs, buttons), 16 (panel titles), 20 (KPI figures), 24 (page titles). Weights 400, 500 and 600 only. Money and counts use `font-variant-numeric: tabular-nums`.

### Space, shape, depth
Spacing steps 4, 8, 12, 16, 24, 32 px. Corner radius 6 px (inputs, buttons, badges) and 8 px (cards, panels). One shadow, `0 1px 2px rgb(15 23 42 / 6%)`, on cards and panels; none on buttons.

## 4. Accessibility floor (WCAG 2.2 AA)
- Text contrast at least 4.5:1, large text at least 3:1 (1.4.3). Input borders, focus rings and control states at least 3:1 (1.4.11). Every token pair above was computed at D.0 (A-300 item 3).
- Each focusable control shows a visible focus ring: 2 px solid `--focus`, 2 px offset (2.4.7). Never `outline: none` without a replacement.
- A focused control is never fully hidden behind a fixed header or menu (2.4.11).
- Click targets are at least 24 by 24 CSS px (2.5.8). Our buttons and inputs are 36 px high, and table row buttons are at least 28 px.
- Colour is never the only sign: badges have words and errors have text.
- 9.8 still reviews the screens against WCAG; Phase D gives it less to fix.

## 5. Page frame
- **Wide screens (900 px and more):** a fixed side menu 240 px wide on the left. From the top: the brand mark and name, then the menu in groups, then the user's name and role, Change password and Sign out at the bottom. The work area on the right has a maximum width of 1200 px.
- **Menu groups** (same buttons and the same permission rules as now): Overview (Dashboard); Records (Members, Expenses); Reports (Categories, Exports); Administration (Staff & access, Audit log). A group with no button the user may see is not shown.
- **The active page** has a 3 px green bar on its left edge and `--sidebar-active` behind it, and the button has `aria-current="page"`.
- **Narrow screens (under 900 px, phones and tablets; D.8, D-126):** a top bar 56 px high stays fixed at the top while the page scrolls, with the brand on the left and a "Menu" button on the right (three bars drawn in CSS, `aria-expanded`, `aria-controls="menu-panel"`). The button opens the menu panel from the left (280 px, at most 85% of the screen), under the bar, with the same groups, the user, Change password and Sign out as on wide screens, and a dark layer over the page. The panel closes when a page is chosen, on a tap on the dark layer, on Escape (the focus goes back to the Menu button) and on sign-out. While closed, CSS hides it (`visibility: hidden`), so it cannot be reached by Tab. No slide when the device asks for reduced motion.
- **Page header** on every screen: the title (24 px), a one-line subtitle in muted text, and the main action button on the right.

## 6. Components (shared classes in `styles.css`)
The screens already share these class names (`field`, `primary-btn`, `secondary-btn`, `danger-btn`, `panel`, `form`, `form-title`, `form-actions`, `table-wrap`, `amount`, `error`, `notice`, `title`). Restyling them once at D.1 lifts every screen at the same time.
- **Buttons:** 36 px high, 0 16 px padding, 6 px corners, weight 500. Primary is green with white text. Secondary is white with a border. Danger is red with white text, used only for confirming a loss. A disabled button is dimmed, with the not-allowed cursor.
- **Inputs and selects:** 36 px high, with the `--border-input` border and 6 px corners. The label sits above the input at 13 px weight 500 in `--text` (not 11 px, not muted). Help and error text sits under the input. An error turns the border `--danger`.
- **Panels and cards:** white, a 1 px `--border` line, 8 px corners and the one shadow. The panel title is 16 px weight 600, with a line under it.
- **KPI card:** the label (13 px, muted), the figure (20 px, weight 600, tabular), and an optional line under it (12 px, muted).
- **Tables:** the column head is 12 px weight 600, muted, on `--surface-muted`. Cells are 13 px with 10 by 12 px padding and a line between rows, and a row lightens on hover. Money columns are right-aligned and tabular (each screen's step right-aligns its money cells and their column heads together; until then they stay left-aligned, A-301). Wide tables scroll inside `table-wrap`, never the whole page.
- **Badges:** 12 px weight 500 with 6 px corners and a word. Active is green-soft, Inactive is neutral, On loan is warning-soft.
- **Notices and errors:** a box with a 4 px left bar (green for a notice, red for an error) and text in the bar's colour. Errors keep `role="alert"`.
- **Empty and loading states:** one muted line inside the panel, for example "No expenses this month." These texts stay as they are now.

## 7. Screens
- **Sign-in:** a centred card on the deep green page, with the brand mark, the system name and the form. There is no gradient: one flat colour.
- **Dashboard:** the page header with the month and staff filters in one row in the header area (not a form card). Two rows of KPI cards: the chosen month, headed by its name, for example "Oct 2026" (Income, Total Expenditures, Withdrawals, Total Outflow) and "All time" (the same four), then a "Position" row (Active Members, Outstanding Loans). The recent expenses table follows, with Amount right-aligned. These are the server's figures only; the group heading names the period, so the card labels carry no period (D.2, A-302).
- **Members:** "+ Add member" on the right of the page header (section 5). The list panel's head row holds the count on the left and the search and the status filter (a group named "Status") on the right, then the table. The add form shows its four fields in two columns, one under 600 px (D.3, A-303). The member detail: the name in the page header with the status and On loan badges under it and the actions (Record payment, Give loan, Reactivate member) on the right; then the Profile panel (Phone, Address and Occupation in one row, a list under 600 px), the Balances panel (two balance cards, then the category table), the Loans panel and the Payments panel, in that order, each full width; money right-aligned in every table. The payment form puts Date, Payment method and Total in one row and the loan form uses two columns, one column under 600 px; the pay-off confirmation stays on the right (D.3b, A-304).
- **Expenses:** "+ Record expense" in the page header; a filter row (the fields in one row, Clear and Apply on the right); then the "Expense history" panel with the count and the total (20 px) in its head and one card per month inside it, Amount and Action right-aligned. The expense form uses two columns with Description and Narration across both, one column under 600 px (D.4, A-305).
- **Categories and Exports:** Categories has a filter row, then the range line and the table, with Paid and Paid out right-aligned. Exports has the kind choice in a panel, then a filter row that holds the Format choice (Excel and PDF side by side) and Clear and Export on the right. The fields go full width under 600 px. The Exports title stays "Export" (copy is out of scope, section 8; D.5, A-306).
- **Staff & access, Audit log and Change password:** Staff & access has "+ Add staff" in the page header, the forms in panels above the list (the add and reset forms in two columns with the permission grid across both, one column under 600 px), and the list table with the row actions as small secondary buttons on the right. The Audit log has a filter row as on Categories (fields 220 px, Clear and Apply on the right), then the table with a tabular time column and the paging line. Change password has a page header, then its form (D.6, A-307).

## 8. Out of scope for Phase D
Dark theme, charts, icons beyond a few inline SVGs, animation, a logo file (none supplied; the "IO" mark stays until the client gives one, A-270 item 5), and copy changes. Each can be its own step later.
