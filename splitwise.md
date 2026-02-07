Project Overview
Create a full-stack expense tracking and management web application similar to Splitwise, built with Next.js. This application enables users to share expenses with friends and roommates, track balances, settle debts, and manage group finances efficiently. The platform must be fully mobile-responsive and include both user-facing features and an admin panel.

## Core Technology Stack

- **Frontend Framework**: Next.js 14+ (App Router)
- **UI Framework**: React with TypeScript
- **Styling**: Tailwind CSS for responsive design
- **Database**: MongoDB
- **ORM**: Mongoose (for MongoDB)
- **Authentication**: NextAuth.js with email/password and optional OAuth (Google, Facebook)
- **State Management**: React Context API or Zustand
- **Charts**: Recharts or Chart.js for data visualization
- **Excel Export**: XLSX or ExcelJS library
- **Deployment**: Vercel

## Detailed Feature Requirements

### 1. Authentication & Authorization System

- **User Registration**:

  - Email and password with validation
  - Email verification link
  - Password strength indicator
  - Terms and conditions acceptance
- **User Login**:

  - Email/password authentication
  - "Remember me" functionality
  - Forgot password flow with reset link
  - Optional social login (Google, Facebook)
- **Session Management**:

  - JWT-based authentication
  - Secure HTTP-only cookies
  - Auto-logout after inactivity (configurable)
  - Multi-device login support

### 2. User Profile & Account Settings

- **Profile Management**:

  - Profile picture upload with crop functionality
  - Full name, email, phone number
  - Default currency preference (INR as default)
  - Time zone settings
  - Language preference
- **Account Settings**:

  - Change password with current password verification
  - Email notification preferences
  - Push notification settings (reminders, settlements, new expenses)
  - Privacy settings (profile visibility)
  - Two-factor authentication (2FA) option
  - Account deletion with data export option
- **Payment Methods**:

  - Add multiple payment methods (UPI, Bank Account, Paytm, GPay, etc.)
  - Set default payment method
  - Payment history

### 3. Friends Management System

- **Add Friends**:

  - Search by email, phone number, or username
  - Send friend requests
  - Accept/decline friend requests
  - Import contacts (with permission)
  - Generate shareable invite link
- **Friends List**:

  - View all friends with balance summary
  - Search and filter friends
  - Sort by name, balance, recent activity
  - Individual balance with each friend (you owe / owes you)
  - Quick settle up button
  - Remove friend option (with balance settlement requirement)
- **Friend Profile**:

  - View friend's profile information
  - Transaction history with that friend
  - Filter transactions by date range
  - Notes/comments section

### 4. Groups Management

- **Create Group**:

  - Group name and description
  - Group image/icon upload
  - Select group type (Home, Trip, Couple, Event, Office, Other)
  - Add multiple members from friends list
  - Set group currency
  - Privacy settings (public/private)
- **Group Details**:

  - List of all members with balances
  - Total group spending
  - Group expense history
  - Group settings (edit name, image, add/remove members)
  - Leave group option
  - Delete group (admin only, requires settlement)
- **Group Roles**:

  - Group admin/creator with special privileges
  - Regular members
  - Admin can remove members or transfer admin rights

### 5. Expense Management (Core Feature)

- **Add Expense**:

  - Expense amount (support decimal values)
  - Description/title of expense
  - Category selection (Food, Transport, Shopping, Entertainment, Utilities, Rent, Healthcare, Other)
  - Currency selector (default INR, support multiple currencies)
  - Date picker (default today, can select past dates)
  - Time picker (optional)
  - Attach receipt image (multiple images support)
  - Add notes/comments
- **Paid By Options**:

  - You paid (default)
  - Friend/member paid
  - Multiple people paid (split payment)
  - Paid outside the group (exclude from balance)
- **Split Options**:

  - Split equally (default)
  - Split by exact amounts (enter amount for each person)
  - Split by percentages
  - Split by shares (1x, 2x, etc.)
  - Custom split with ability to exclude members
  - Itemized split (bill splitting with individual items)
- **Expense Context**:

  - Add to group or keep between friends
  - Select specific group from dropdown
  - Tag multiple people
- **Edit/Delete Expense**:

  - Edit any expense details
  - Delete expense (only by creator or admin)
  - View edit history with timestamps
  - Notification to affected members on changes

### 6. Settlement & Payment Tracking

- **Settle Up Feature**:

  - Calculate optimal settlement path (minimize transactions)
  - Settle up with a friend (full or partial amount)
  - Settle up within a group
  - Record payment method used
  - Add payment confirmation screenshot
  - Payment date and time
  - Add note to settlement
- **Settlement History**:

  - View all past settlements
  - Filter by date, person, group
  - Export settlement history
- **Payment Reminders**:

  - Send payment reminder to friend/member
  - Automated reminder settings (weekly/monthly)
  - Push notifications for reminders
  - In-app notification center
  - Email reminders (optional)
  - Custom reminder message

### 7. Dashboard & Overview

- **Main Dashboard**:

  - Total balance summary (overall you owe / you are owed)
  - Quick stats cards (total expenses this month, active groups, pending settlements)
  - Recent activity feed (last 10-20 transactions)
  - Upcoming payment reminders
  - Monthly spending trend graph
- **Individual Balances**:

  - "You Owe" section with list of people and amounts
  - "You Are Owed" section with list of people and amounts
  - Sort by amount (highest to lowest)
  - Color coding (red for owe, green for owed)
  - Quick settle button for each entry
- **Group Balances**:

  - Balance summary for each group
  - "You Owe in Group" vs "You Are Owed in Group"
  - Group-wise expense breakdown
  - Click to view detailed group page

### 8. Activity Feed & History

- **Activity Log**:

  - Chronological list of all activities
  - Filter by type (expenses, settlements, group events, friend requests)
  - Filter by date range
  - Filter by person or group
  - Search functionality
  - Infinite scroll or pagination
- **Activity Types**:

  - Expense added/edited/deleted
  - Settlement recorded
  - Friend added/removed
  - Group created/modified
  - Payment reminders sent/received
  - Comments/notes added

### 9. Analytics & Reports

- **Charts & Visualizations**:

  - Monthly expense trend (line/bar chart)
  - Category-wise spending (pie chart)
  - Group-wise spending comparison
  - Daily/weekly/monthly spending patterns
  - Top expense categories
  - Spending by friend/member
  - Customizable date range for all charts
- **Spending Insights**:

  - Average daily/weekly/monthly spending
  - Comparison with previous period
  - Budget vs actual spending
  - Spending alerts (if exceeds threshold)
  - Category-wise budget tracking

### 10. Export & Backup

- **Excel Export**:

  - Export all expenses to Excel (.xlsx format)
  - Export specific group expenses
  - Export expenses by date range
  - Export settlement history
  - Include columns: Date, Description, Category, Amount, Paid By, Split With, Group, Notes
  - Formatted and ready-to-use spreadsheet
- **PDF Export**:

  - Generate PDF reports (monthly/yearly)
  - Expense summary with charts
  - Settlement receipts
- **Data Backup**:

  - Download complete data (JSON format)
  - Scheduled auto-backup option
  - Data import feature (restore from backup)

### 11. Notifications System

- **Push Notifications**:

  - New expense added where you're involved
  - Payment reminder received
  - Settlement recorded
  - Friend request received
  - Group invitation
  - Comment/note on your expense
  - Weekly/monthly summary
- **In-App Notifications**:

  - Notification bell icon with badge count
  - Notification center/panel
  - Mark as read/unread
  - Clear all notifications
- **Email Notifications** (optional):

  - Digest emails (daily/weekly summary)
  - Important alerts only
  - Customizable preferences

### 12. Admin Panel

- **Admin Authentication**:

  - Separate admin login route (/admin)
  - Role-based access control
  - Admin credentials secured
- **User Management**:

  - View all users with pagination
  - Search users by name, email
  - Filter by registration date, activity status
  - View user details (profile, expenses, groups)
  - Edit user information
  - Suspend/activate user accounts
  - Delete user (with confirmation)
  - Export user list to CSV/Excel
- **Analytics Dashboard**:

  - Total users count
  - Active users (last 7/30 days)
  - Total expenses recorded
  - Total groups created
  - User growth chart
  - Platform usage statistics
- **System Settings**:

  - Global currency settings
  - Default notification preferences
  - Feature toggles (enable/disable features)
  - Maintenance mode
  - System announcements
- **Audit Logs**:

  - Track admin actions
  - User activity logs
  - System error logs

### 13. Additional Features (Value-Adds)

- **Multi-Currency Support**:

  - Automatic currency conversion using live exchange rates
  - API integration (ExchangeRate-API or similar)
  - Display amounts in user's preferred currency
  - Historical exchange rates for past expenses
- **Recurring Expenses**:

  - Set up recurring bills (rent, subscriptions, etc.)
  - Frequency options (daily, weekly, monthly, yearly)
  - Auto-create expenses on schedule
  - Edit/cancel recurring setup
- **Bill Scanning & OCR**:

  - Upload receipt image
  - Auto-extract amount, date, merchant using OCR
  - Review and confirm before saving
  - Supported formats: JPG, PNG, PDF
- **Budget Management**:

  - Set monthly budgets by category
  - Budget alerts when approaching limit
  - Budget vs actual spending visualization
  - Budget recommendations based on history
- **Expense Categories & Tags**:

  - Pre-defined categories with icons
  - Custom category creation
  - Multiple tags per expense
  - Filter expenses by tags
- **Comments & Discussions**:

  - Comment on any expense
  - Reply to comments (threaded)
  - Mention users with @ symbol
  - Emoji reactions to expenses/comments
- **Offline Support**:

  - Progressive Web App (PWA)
  - Add to home screen
  - Offline mode for viewing data
  - Sync when back online
- **Simplified Debts**:

  - Algorithm to minimize number of transactions
  - Suggest optimal settlement path
  - "Simplify debts" button to recalculate
- **Expense Splitting Templates**:

  - Save frequently used split patterns
  - Quick apply templates
  - Example: "Rent split", "Grocery split"
- **Dark Mode**:

  - Toggle between light and dark themes
  - Remember preference
  - System preference detection
- **Language Support**:

  - Multi-language interface (Hindi, English initially)
  - Easy to add more languages
  - i18n implementation
- **Search & Filters**:

  - Global search across expenses
  - Advanced filters (date, amount range, category, person, group)
  - Save filter presets
  - Recent searches

## Technical Implementation Details

### Database Schema (Key Models)

**Users**:

- id, email, password (hashed), name, phone, profilePicture, defaultCurrency, createdAt, updatedAt, isActive, role (user/admin)

**Friends**:

- id, userId, friendId, status (pending/accepted), createdAt

**Groups**:

- id, name, description, image, type, currency, createdBy, createdAt, updatedAt

**GroupMembers**:

- id, groupId, userId, role (admin/member), joinedAt

**Expenses**:

- id, amount, description, category, date, currency, createdBy, groupId (nullable), image, notes, createdAt, updatedAt

**ExpenseParticipants**:

- id, expenseId, userId, paidAmount, owedAmount, isSettled

**Settlements**:

- id, fromUserId, toUserId, amount, currency, method, note, date, createdAt

**Notifications**:

- id, userId, type, message, isRead, createdAt

### API Endpoints Structure

**Auth Routes**:

- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- POST /api/auth/forgot-password
- POST /api/auth/reset-password
- GET /api/auth/verify-email

**User Routes**:

- GET /api/user/profile
- PUT /api/user/profile
- PUT /api/user/password
- DELETE /api/user/account

**Friends Routes**:

- GET /api/friends
- POST /api/friends/request
- PUT /api/friends/accept/:id
- DELETE /api/friends/:id
- GET /api/friends/search

**Groups Routes**:

- GET /api/groups
- POST /api/groups
- GET /api/groups/:id
- PUT /api/groups/:id
- DELETE /api/groups/:id
- POST /api/groups/:id/members
- DELETE /api/groups/:id/members/:userId

**Expenses Routes**:

- GET /api/expenses
- POST /api/expenses
- GET /api/expenses/:id
- PUT /api/expenses/:id
- DELETE /api/expenses/:id
- GET /api/expenses/group/:groupId

**Settlements Routes**:

- GET /api/settlements
- POST /api/settlements
- GET /api/settlements/history

**Dashboard Routes**:

- GET /api/dashboard/summary
- GET /api/dashboard/balances
- GET /api/dashboard/activity

**Analytics Routes**:

- GET /api/analytics/charts
- GET /api/analytics/insights

**Export Routes**:

- GET /api/export/excel
- GET /api/export/pdf

**Admin Routes**:

- GET /api/admin/users
- PUT /api/admin/users/:id
- DELETE /api/admin/users/:id
- GET /api/admin/analytics

## UI/UX Requirements

### Mobile Responsiveness

- **Breakpoints**: Mobile (< 640px), Tablet (640-1024px), Desktop (> 1024px)
- Touch-friendly buttons (minimum 44x44px)
- Swipe gestures (swipe to delete, swipe to settle)
- Bottom navigation for mobile
- Hamburger menu for mobile navigation
- Responsive tables (stack on mobile)
- Optimized images for mobile bandwidth

### Design Guidelines

- **Color Scheme**:

  - Primary: Teal/Green for positive balances
  - Secondary: Red/Orange for debts
  - Neutral: Gray for UI elements
  - Background: White/Light gray (light mode), Dark gray (dark mode)
- **Typography**:

  - Clear, readable fonts (Inter, Roboto, or system fonts)
  - Font sizes: 14-16px for body, 20-24px for headings
  - Proper line height and spacing
- **Icons**:

  - Consistent icon library (Lucide, Heroicons, or Font Awesome)
  - Icons for all categories, actions, and navigation
- **Loading States**:

  - Skeleton loaders for data fetching
  - Progress indicators for file uploads
  - Optimistic UI updates where appropriate
- **Error Handling**:

  - User-friendly error messages
  - Validation feedback on forms
  - Toast notifications for success/error
  - Fallback UI for errors

## Security Considerations

- Input validation and sanitization

## Performance Optimization

- Code splitting and lazy loading
- Image optimization (WebP format, responsive images)
- Caching strategies (browser cache)
- Database indexing on frequently queried fields
- Pagination for large datasets
- Debouncing search inputs
- Optimistic UI updates

## Testing Requirements

- Unit tests for utility functions
- Integration tests for API endpoints
- E2E tests for critical user flows
- Mobile responsiveness testing
- Cross-browser compatibility testing
- Performance testing (Lighthouse scores)

---

## Implementation Priority (Phases)

**Phase 1 (MVP)**:

1. Authentication system
2. User profile management
3. Add friends
4. Add/edit/delete expenses
5. Basic split equally feature
6. Dashboard with balances
7. Settlement recording

**Phase 2**:

1. Groups functionality
2. Advanced split options
3. Activity feed
4. Notifications system
5. Charts and analytics
6. Excel export

**Phase 3**:

1. Admin panel
2. Payment reminders
3. Multi-currency support
4. Recurring expenses
5. Mobile app optimization (PWA)
6. Dark mode

Create a modern, intuitive, and visually appealing mobile-first UI/UX design for an expense tracking and splitting application. The design should be clean, professional, trustworthy, and optimized for daily use by students and young professionals sharing expenses with roommates and friends.

Design Philosophy & Principles
Core Design Values

Clarity First: Every screen should have a clear purpose with minimal cognitive load
Speed & Efficiency: Users should complete common tasks (add expense, settle up) in under 30 seconds
Trust & Transparency: Financial data should feel secure and accurate
Friendly & Approachable: Not corporate banking, but not childish either - think "friend helping a friend"
Mobile-First: Design for thumb zones, one-handed use, and small screens first

Design Approach

Minimalist: Remove unnecessary elements, embrace white space
Scannable: Use visual hierarchy so users can quickly find what they need
Consistent: Patterns repeat across the app for familiarity
Forgiving: Easy undo, clear confirmations, gentle error handling
Accessible: WCAG 2.1 AA compliant with good contrast and readable text

Color Palette Design
Primary Color Scheme
Option 1: Fresh & Modern (Recommended)
Primary (Main Brand):

- Teal/Turquoise: #00B8A9 (rgb: 0, 184, 169)
- Teal Dark: #00A896 (for hover states)
- Teal Light: #E6F7F5 (for backgrounds)

Secondary (Debts/Owed):

- Coral/Salmon: #FF6B6B (rgb: 255, 107, 107) - for amounts you owe
- Green: #51CF66 (rgb: 81, 207, 102) - for amounts owed to you

Neutral Grays:

- Text Primary: #1A1A1A (almost black)
- Text Secondary: #6B7280 (medium gray)
- Text Tertiary: #9CA3AF (light gray)
- Border: #E5E7EB
- Background: #FFFFFF
- Background Secondary: #F9FAFB
- Background Tertiary: #F3F4F6

Semantic Colors:

- Success: #10B981 (green)
- Warning: #F59E0B (amber)
- Error: #EF4444 (red)
- Info: #3B82F6 (blue)
  Option 2: Bold & Vibrant
  Primary: #6366F1 (Indigo)
  Secondary Owed: #10B981 (Emerald Green)
  Secondary Debt: #F43F5E (Rose Red)
  Neutrals: Same as Option 1
  Option 3: Warm & Friendly
  Primary: #8B5CF6 (Purple)
  Secondary Owed: #22C55E (Green)
  Secondary Debt: #F97316 (Orange)
  Neutrals: Same as Option 1
  Dark Mode Color Palette
  Background: #0F172A (dark blue-gray)
  Background Secondary: #1E293B
  Background Tertiary: #334155
  Text Primary: #F1F5F9
  Text Secondary: #CBD5E1
  Text Tertiary: #94A3B8
  Border: #334155

Primary remains vibrant but slightly desaturated
Secondary colors remain but at 90% brightness
Color Usage Guidelines
Financial Amounts Color Coding:

Positive Balance (You are owed): Green shades (#10B981 to #51CF66)
Negative Balance (You owe): Red/Coral shades (#FF6B6B to #EF4444)
Settled/Zero Balance: Gray (#6B7280)
Total Balance: Use green if positive, red if negative, with larger font size

UI Element Colors:

Primary Buttons: Primary color (#00B8A9) with white text
Secondary Buttons: White background with primary color border and text
Destructive Actions: Error red (#EF4444)
Disabled States: Gray (#E5E7EB) background with light gray text
Links: Primary color, underline on hover
Badges/Tags: Light backgrounds with darker text (e.g., #E6F7F5 bg with #00A896 text)

Background Usage:

Cards/Sections: White (#FFFFFF) on light gray background (#F9FAFB)
Alternate Rows: Very light gray (#F9FAFB) alternating with white
Highlighted Items: Primary color at 10% opacity (#00B8A91A)
Warnings/Alerts: Semantic color at 10% opacity with border

Typography System
Font Selection
Primary Font: Inter (Recommended)

Modern, highly legible, excellent for numbers
Supports multiple weights
Great for both headings and body text
Web-safe with Google Fonts CDN
Alternative: SF Pro (iOS feel), Roboto (Android feel)

Secondary Font (Optional for headings): Poppins or Manrope

Friendly, rounded, modern
Use for large headings only if you want more personality
Keep Inter for everything else for consistency

Monospace Font for Numbers: JetBrains Mono or SF Mono

Use for displaying amounts/currency
Makes numbers easier to scan and compare
Tabular figures for alignment

Font Sizes & Hierarchy
Mobile (320px - 767px)
css/* Headings */
h1: 28px / 2rem - Bold (700) - Line height: 1.2
h2: 24px / 1.5rem - Semibold (600) - Line height: 1.3
h3: 20px / 1.25rem - Semibold (600) - Line height: 1.4
h4: 18px / 1.125rem - Medium (500) - Line height: 1.4

/* Body Text */
Body Large: 16px / 1rem - Regular (400) - Line height: 1.6
Body: 14px / 0.875rem - Regular (400) - Line height: 1.6
Body Small: 13px / 0.8125rem - Regular (400) - Line height: 1.5
Caption: 12px / 0.75rem - Regular (400) - Line height: 1.4

/* Special */
Button Text: 15px / 0.9375rem - Medium (500)
Amount Display: 24-32px / 1.5-2rem - Semibold (600) - Monospace
Small Amount: 16px / 1rem - Medium (500) - Monospace
Desktop (1024px+)
css/* Scale up by 10-20% */
h1: 32px / 2rem
h2: 28px / 1.75rem
h3: 24px / 1.5rem
Body: 16px / 1rem
Amount Display: 36-48px / 2.25-3rem

```

### Typography Usage Rules

1. **Maximum 3 font weights**: Regular (400), Medium (500), Semibold/Bold (600-700)
2. **Line length**: 50-75 characters for body text, use max-width
3. **Line height**: 1.5-1.6 for body text, 1.2-1.3 for headings
4. **Letter spacing**: Default for body, -0.02em for large headings
5. **All caps**: Only for small labels, use letter-spacing: 0.05em
6. **Number alignment**: Use tabular-nums or monospace for financial amounts

---

## Icon System

### Icon Library: Lucide Icons (Recommended)
- **Why**: Clean, consistent, modern, lightweight, actively maintained
- **Style**: Outline/stroke-based icons (not filled)
- **Stroke Width**: 2px for consistency
- **Size**: 20px (mobile), 24px (desktop) - scale uniformly
- **Alternative**: Heroicons, Feather Icons, Phosphor Icons

### Icon Colors
- **Default**: Text secondary color (#6B7280)
- **Active/Selected**: Primary color (#00B8A9)
- **On Colored Backgrounds**: White
- **Positive Actions**: Green (#10B981)
- **Negative Actions**: Red (#EF4444)

### Essential Icons Needed

**Navigation & Core Actions**:
- Home/Dashboard: `home` or `layout-dashboard`
- Friends: `users` or `user-plus`
- Groups: `users-2` or `users-round`
- Activity: `activity` or `list`
- Settings: `settings` or `sliders`
- Add (FAB): `plus` or `plus-circle`
- Menu: `menu` or `more-vertical`
- Back: `arrow-left` or `chevron-left`
- Close: `x`
- Search: `search`

**Expense Related**:
- Add Expense: `plus-circle` or `receipt-text`
- Edit: `pencil` or `edit`
- Delete: `trash-2` or `trash`
- Split: `split` or `git-branch`
- Receipt/Bill: `receipt` or `file-text`
- Camera: `camera` for uploading receipts
- Calendar: `calendar` for date selection
- Tag/Category: `tag` or `folder`

**Money & Payments**:
- Currency: `dollar-sign` or `indian-rupee` (₹)
- Wallet: `wallet`
- Bank: `landmark` or `building-2`
- Payment: `credit-card`
- Settle Up: `check-circle` or `hand-coins`
- Send Money: `arrow-right-circle`
- Receive Money: `arrow-down-circle`

**Social**:
- Friend Request: `user-plus`
- Group: `users-2`
- Share: `share-2`
- Notifications: `bell` (with badge for unread)
- Chat/Comment: `message-circle`

**Categories** (with appropriate icons):
- Food: `utensils` or `chef-hat`
- Transport: `car` or `bus`
- Shopping: `shopping-bag`
- Entertainment: `film` or `music`
- Utilities: `zap` or `droplet`
- Rent: `home`
- Healthcare: `heart-pulse`
- General: `circle-dot`

**Analytics & Charts**:
- Chart: `bar-chart-2` or `trending-up`
- Download/Export: `download`
- Filter: `filter`
- Sort: `arrow-up-down`

**Status Indicators**:
- Success: `check-circle`
- Warning: `alert-triangle`
- Error: `x-circle`
- Info: `info`

### Icon Implementation Guidelines

1. **Consistent Sizing**: Use 20px or 24px, scale up for touch targets
2. **Touch Targets**: Minimum 44x44px clickable area around icons
3. **Spacing**: 8-12px padding around icons in buttons
4. **Alignment**: Center-align icons with text vertically
5. **Color States**: Default → Hover (slightly darker) → Active (primary color)
6. **Badge Indicators**: Small red dot (8px) on top-right for notifications

---

## Component Design Specifications

### Buttons

**Primary Button**:
```

Background: Primary color (#00B8A9)
Text: White, 15px, Medium weight
Padding: 12px 24px (mobile), 14px 32px (desktop)
Border Radius: 8px
Height: 44px minimum (mobile), 48px (desktop)
Hover: Darken by 8%
Active: Darken by 12%, slight scale (0.98)
Disabled: Gray background (#E5E7EB), gray text (#9CA3AF)
Shadow: 0 1px 3px rgba(0,0,0,0.1)

```

**Secondary Button**:
```

Background: White
Border: 1.5px solid primary color
Text: Primary color, 15px, Medium
Same dimensions as primary
Hover: Light primary background (10% opacity)

```

**Destructive Button**:
```

Same as primary but with error red (#EF4444)
Use sparingly (delete, remove actions)

```

**Icon Button**:
```

Square: 44x44px minimum
Round/Circle: border-radius 50%
Icon: 20px, centered
Background: Transparent or light gray
Hover: Light gray background

```

**Floating Action Button (FAB)**:
```

Position: Fixed bottom-right on mobile (24px from edges)
Size: 56x56px
Shape: Circle (border-radius: 50%)
Background: Primary color with gradient
Icon: Plus, 24px, white
Shadow: 0 4px 12px rgba(0,184,169,0.3)
Hover: Slight scale up (1.05)

```

### Form Inputs

**Text Input**:
```

Height: 44px (mobile), 48px (desktop)
Padding: 12px 16px
Border: 1.5px solid #E5E7EB
Border Radius: 8px
Font: 15px, regular
Placeholder: #9CA3AF

Focus State:

- Border: Primary color
- Box shadow: 0 0 0 3px rgba(0,184,169,0.1)
- Outline: none

Error State:

- Border: Error red
- Box shadow: Red tint
- Helper text below in red

Disabled State:

- Background: #F9FAFB
- Text: #9CA3AF

```

**Search Input**:
```

Same as text input
Icon: Search icon (20px) on left, 40px from left edge
Padding-left: 44px
Clear button (X) on right when has value

```

**Dropdown/Select**:
```

Same styling as text input
Chevron-down icon on right
Custom dropdown menu with:

- White background
- Border: 1px solid #E5E7EB
- Shadow: 0 4px 12px rgba(0,0,0,0.1)
- Border radius: 8px
- Max height: 300px (scrollable)
- Options: 44px height, 16px padding
- Hover: Light gray background

```

**Checkbox/Radio**:
```

Size: 20x20px
Border: 2px solid #D1D5DB
Border radius: 4px (checkbox), 50% (radio)
Checked: Primary color background, white checkmark
Focus: Box shadow ring
Label: 14px, 8px left margin

```

**Toggle/Switch**:
```

Width: 44px, Height: 24px
Track: Gray when off, primary when on
Thumb: 20px circle, white
Smooth transition: 200ms

```

**Amount Input**:
```

Same as text input
Font: Monospace for numbers
Currency symbol (₹) prefix
Large text: 20-24px
Clear number formatting (commas for thousands)
Keypad input on mobile

```

### Cards

**Standard Card**:
```

Background: White
Border: None or 1px solid #E5E7EB
Border Radius: 12px
Padding: 16px (mobile), 20px (desktop)
Shadow: 0 1px 3px rgba(0,0,0,0.08)
Hover: Slight shadow increase (interactive cards)
Gap between cards: 12px

```

**Expense Card**:
```

Display: Flex row
Avatar/Icon: 40px circle on left
Content: Middle section (flex-grow)

- Title: 15px, semibold
- Subtitle: 13px, gray (date, category)
  Amount: Right-aligned
- Font: 16px, semibold, monospace
- Color: Green (owed to you) or Red (you owe)
  Divider: 1px solid #F3F4F6 between items
  Tap area: Entire card (44px minimum height)

```

**Balance Card**:
```

Background: Gradient (light primary to white)
Large amount: 32px, bold, monospace, centered
Label: 13px, gray, above amount
Border radius: 16px
Padding: 24px
Shadow: Soft shadow

```

**Group Card**:
```

Group image: 48px circle or rounded square
Group name: 16px, semibold
Members: Small avatars (24px), overlapping
Balance: Below name, 14px
Arrow/Chevron: Right side
Height: 72px minimum

```

### Navigation

**Bottom Navigation (Mobile)**:
```

Position: Fixed bottom, full width
Height: 64px (with safe area)
Background: White
Border-top: 1px solid #E5E7EB
Shadow: 0 -2px 8px rgba(0,0,0,0.05)

Items: 4-5 max
Each item:

- Icon: 24px
- Label: 11px, below icon
- Active: Primary color
- Inactive: Gray (#6B7280)
- Tap area: Full height
- Center FAB (raised button for "Add")

```

**Top App Bar (Mobile)**:
```

Height: 56px + status bar
Background: White or Primary (depends on screen)
Title: 18px, semibold, centered or left-aligned
Back button: Left (44x44px)
Actions: Right (icons, 44x44px each)
Shadow: 0 1px 3px rgba(0,0,0,0.1)

```

**Sidebar (Desktop)**:
```

Width: 240px
Background: White or light gray
Navigation items:

- Height: 44px
- Padding: 12px 16px
- Icon + text
- Hover: Light gray background
- Active: Primary color background (10% opacity)
  Collapsible on tablet

```

### Lists & Tables

**List Item**:
```

Height: 64px minimum (comfortable tap)
Padding: 12px 16px
Divider: 1px solid #F3F4F6
Layout: Flex row

- Avatar/icon: 40px (left)
- Content: Flex-grow (middle)
  - Primary text: 15px, semibold
  - Secondary text: 13px, gray
- Meta: Right-aligned
  - Amount, time, arrow, etc.
    Swipe actions: Settle up (green), Delete (red)

```

**Table (Desktop)**:
```

Header:

- Background: #F9FAFB
- Text: 13px, uppercase, medium, gray
- Height: 44px
- Padding: 12px 16px
- Border-bottom: 2px solid #E5E7EB

Rows:

- Height: 56px
- Padding: 12px 16px
- Border-bottom: 1px solid #F3F4F6
- Hover: Light gray background
- Alternate rows: Slight gray tint (optional)

Responsive: Stack to cards on mobile

```

### Modals & Dialogs

**Modal**:
```

Background: White
Border radius: 16px (top corners on mobile)
Max width: 480px (desktop)
Full width on mobile (slide up from bottom)
Padding: 24px
Shadow: 0 20px 40px rgba(0,0,0,0.2)

Header:

- Title: 20px, semibold
- Close button: Top-right (X icon)

Content:

- Scrollable if needed
- Forms, text, etc.

Footer:

- Buttons: Right-aligned on desktop, stacked on mobile
- Gap: 12px between buttons

```

**Bottom Sheet (Mobile)**:
```

Slides up from bottom
Rounded top corners: 16px
Max height: 90vh
Handle: Gray pill at top (32px wide, 4px tall)
Swipe down to dismiss
Overlay: Dark transparent (rgba(0,0,0,0.5))

```

**Alert/Confirmation Dialog**:
```

Similar to modal but:
Max width: 360px
Icon at top (warning, error, success)
Centered text
2 buttons max (cancel + confirm)

```

### Toast Notifications
```

Position: Top-center (mobile), top-right (desktop)
Width: 90% max (mobile), 360px (desktop)
Background: White
Border-left: 4px solid (color based on type)
Shadow: 0 4px 12px rgba(0,0,0,0.15)
Border radius: 8px
Padding: 16px
Duration: 4 seconds
Icon: Left (success/error/info/warning)
Close button: Right
Stacking: Multiple toasts stack vertically
Animation: Slide in from top, fade out

```

### Badges & Tags

**Badge (Notification Count)**:
```

Shape: Circle or pill
Size: 18px height minimum
Background: Error red
Text: White, 11px, bold
Position: Top-right of icon/avatar
Min number: Display 1-99, show "99+" for more

```

**Tag/Label**:
```

Background: Light color (semantic or category)
Text: Darker shade of same color
Border radius: 4px
Padding: 4px 8px
Font: 12px, medium

```

### Charts & Data Visualization

**Chart Container**:
```

Background: White card
Padding: 20px
Border radius: 12px
Shadow: Subtle
Title: 18px, semibold, above chart
Legend: Below or right side
Height: 250px (mobile), 300px (desktop)

```

**Chart Colors**:
```

Use primary color and complementary colors
Avoid red-green only (accessibility)
Use patterns for added clarity
Tooltips: Dark background, white text
Grid lines: Light gray (#E5E7EB)

```

---

## Screen-Specific Layouts

### 1. Login/Register Screen

**Layout**:
```

- Logo/App name: Top, 80px from top
- Illustration (optional): Below logo
- Form:
  - Email input
  - Password input
  - Forgot password link (right-aligned, 13px)
  - Login button (full width, primary)
  - Divider with "OR"
  - Social login buttons (Google, Facebook - outlined)
  - Register link: Bottom, centered
- Padding: 24px sides
- Max width: 400px, centered

```

### 2. Dashboard/Home Screen

**Layout**:
```

Top Section (Balance Summary):

- Large card with:
  - "Total Balance" label
  - Large amount (green or red)
  - 2 smaller cards below: "You Owe" | "You're Owed"
- Gradient background

Quick Stats (Optional):

- 3 stat cards in a row
- Icon + number + label
- Example: Expenses this month, Active groups, Friends

Activity Feed:

- Section title: "Recent Activity"
- List of expense cards
- "See all" link

Bottom Navigation: Fixed

FAB: "Add Expense" bottom-right

```

### 3. Add Expense Screen (Critical UX)

**Layout**:
```

Form (vertical, scrollable):

1. Amount input: Large, prominent, top

   - Currency symbol prefix (₹)
   - Large text (28px)
   - Auto-focus on load
   - Number keyboard on mobile
2. Description input:

   - Icon: Receipt
   - Placeholder: "What's this for?"
3. Category selector:

   - Horizontal scrollable chips
   - Icons for each category
   - Selected: Primary color background
4. Date picker:

   - Default: Today
   - Calendar icon
   - Bottom sheet calendar on tap
5. Paid by:

   - Your avatar + name (default)
   - Tap to change (bottom sheet with friends list)
6. Split with:

   - "Split equally" chip (default)
   - Add people: Tap to select from friends/group
   - Display selected people as avatar chips
   - Tap to change split method
7. Group (optional):

   - Dropdown or bottom sheet
   - "No group" default
8. Attach receipt (optional):

   - Camera icon button
   - Thumbnail preview if uploaded
9. Notes (optional):

   - Expandable text area

Bottom:

- Cancel button (secondary)
- Save button (primary, full width below)

Sticky Header:

- Title: "Add Expense"
- Close button (X)

```

### 4. Friends List Screen

**Layout**:
```

Search bar: Top (sticky)

Tabs: "All Friends" | "Pending Requests" (if any)

List:

- Friend cards (avatar, name, balance)
- Color-coded amounts (green/red)
- Swipe for quick actions:
  - Left swipe: Settle up (green)
  - Right swipe: Add expense (blue)

Empty state: Illustration + "Add friends to get started"

FAB: "Add Friend" icon

```

### 5. Group Detail Screen

**Layout**:
```

Header:

- Group image: Large, top
- Group name: 24px, centered below image
- Members: Horizontal avatars, scrollable
- Edit group button (top-right icon)

Balance Summary Card:

- "Your balance in this group"
- Amount (green/red)
- "Settle up" button if you owe

Tabs: "Expenses" | "Balances" | "Totals"

Expense List:

- Reverse chronological
- Grouped by month (sticky headers)

FAB: "Add Expense to Group"

```

### 6. Activity/History Screen

**Layout**:
```

Filters: Top (chips)

- All, Expenses, Settlements, Groups

Search: Sticky

Timeline List:

- Date headers (sticky)
- Activity cards
  - Icon (type indicator)
  - Description
  - People involved
  - Amount (if applicable)
- Pull to refresh

Empty state: Illustration + message

```

### 7. Analytics/Charts Screen

**Layout**:
```

Date range selector: Top

- Chips: This month, Last month, Custom

Chart Tabs:

- Spending trend (line chart)
- By category (pie chart)
- By group (bar chart)

Each chart in a card:

- Title
- Chart (responsive)
- Summary stats below

Export button: Top-right (download icon)

```

### 8. Profile/Settings Screen

**Layout**:
```

Profile Section:

- Large avatar (center)
- Name (18px, semibold)
- Email (14px, gray)
- Edit profile button

Settings List:

- Grouped sections with headers
- Icons for each setting
- Chevron-right for navigation items
- Toggles for switches

Sections:

1. Account: Email, Password, Phone
2. Preferences: Currency, Language, Theme
3. Notifications: Push, Email (toggles)
4. Privacy: Profile visibility
5. About: Version, Help, Feedback
6. Logout button (destructive)

```

### 9. Settle Up Screen

**Layout**:
```

Header: "Settle up with [Name]"

Amount Section:

- Large display: Amount to settle
- "You owe" or "Owes you" label
- Option to settle partial amount

Payment Method:

- Radio buttons or dropdown
- UPI, Bank transfer, Cash, etc.
- Selected method highlighted

Proof (optional):

- Upload screenshot button
- Thumbnail preview

Date: Default today, can change

Note (optional):

- Text area

Buttons:

- Cancel (secondary)
- Record Payment (primary)

Confirmation:

- Success animation
- Share receipt option

```

---

## Mobile Optimization Guidelines

### Touch Targets
```

Minimum size: 44x44px (Apple HIG)
Recommended: 48x48px
Spacing between targets: 8px minimum

```

### Thumb Zones
```

Easy reach: Bottom 1/3 of screen
Primary actions (FAB, main buttons): Bottom-right
Navigation: Bottom bar
Critical actions: Within thumb reach (320-480px from bottom)

```

### Gestures
```

Swipe left/right: Navigate, reveal actions
Swipe down: Refresh, dismiss modal
Pinch: Zoom (images, charts)
Long press: Context menu, select
Pull down: Refresh list

```

### Performance
```

Touch response: < 100ms
Animation frame rate: 60fps
Transition duration: 200-300ms
Loading states: Show immediately
Skeleton screens: For data loading
Optimistic UI: Update before server confirms

```

### Responsive Breakpoints
```

Mobile small: 320px - 374px
Mobile medium: 375px - 424px
Mobile large: 425px - 767px
Tablet: 768px - 1023px
Desktop: 1024px+

```

### Safe Areas (iOS)
```

Account for notch and home indicator
Use env(safe-area-inset-*)
Bottom nav: Add safe-area-inset-bottom padding
Fixed elements: Respect safe areas

```

---

## Accessibility Requirements

### Color Contrast
```

Normal text: 4.5:1 minimum
Large text (18px+): 3:1 minimum
Test with contrast checker tools
Never rely on color alone for meaning

```

### Text Sizing
```

Allow text resize up to 200%
Use relative units (rem, em)
Minimum font size: 14px for body
Test with iOS/Android text sizing settings

```

### Focus Indicators
```

Visible focus ring: 2px solid primary color
Focus offset: 2px from element
Never remove focus styles
High contrast mode support

```

### Screen Reader Support
```

Semantic HTML (headings, lists, buttons)
ARIA labels for icons and actions
ARIA live regions for dynamic content
Meaningful alt text for images
Form labels properly associated
Error messages announced

```

### Keyboard Navigation
```

Tab order: Logical flow
All interactive elements: Keyboard accessible
Skip links: Skip to main content
Modal trap: Focus within modal
Escape key: Close modals/dialogs

```

---

## Animation & Micro-interactions

### Transitions
```

Duration: 200-300ms (UI), 400-500ms (page)
Easing: ease-out for entering, ease-in for exiting
Properties: Transform and opacity (GPU accelerated)
Avoid: Width, height, margin (causes reflow)

```

### Loading States
```

Skeleton screens: Gray placeholders matching layout
Spinners: Only for short waits (< 3 seconds)
Progress bars: For known duration tasks
Shimmer effect: Subtle animation on skeletons

```

### Success Animations
```

Checkmark: Appear with scale + fade
Confetti: Subtle, for major actions (settled debt)
Slide out: Remove items from lists
Fade: Soft transitions

```

### Button States
```

Hover: Background darken, cursor pointer
Active/Press: Scale down (0.98), deeper shadow
Disabled: Reduced opacity, no interaction
Loading: Spinner inside button, text hidden

```

### Page Transitions
```

Stack navigation: Slide left/right
Modal: Slide up from bottom (mobile)
Fade: For same-level navigation
Shared element: Morph between screens (advanced)

```

---

## Design System Documentation

### Component Library Structure
```

1. Foundation

   - Colors
   - Typography
   - Spacing
   - Shadows
   - Border radius
   - Breakpoints
2. Components

   - Buttons
   - Forms
   - Cards
   - Navigation
   - Modals
   - Lists
   - Charts
3. Patterns

   - Layouts
   - Navigation flows
   - Form patterns
   - Empty states
   - Error states
   - Loading states
4. Templates

   - Screen layouts
   - Email templates
   - PDF templates

```

### Spacing Scale
```

4px: 0.25rem - xs (tight spacing)
8px: 0.5rem - sm (element padding)
12px: 0.75rem - md (card padding)
16px: 1rem - lg (section padding)
24px: 1.5rem - xl (page padding)
32px: 2rem - 2xl (large gaps)
48px: 3rem - 3xl (section separation)
64px: 4rem - 4xl (major separation)

```

### Shadow Scale
```

xs: 0 1px 2px rgba(0,0,0,0.05) - subtle
sm: 0 1px 3px rgba(0,0,0,0.1) - cards
md: 0 4px 6px rgba(0,0,0,0.1) - raised elements
lg: 0 10px 15px rgba(0,0,0,0.1) - modals
xl: 0 20px 25px rgba(0,0,0,0.1) - large modals

```

### Border Radius
```

sm: 4px - small elements, tags
md: 8px - buttons, inputs
lg: 12px - cards
xl: 16px - modals
2xl: 24px - large cards
full: 9999px - circles, pills

Implementation Tools & Resources
Design Tools

Figma: Primary design tool (collaborative, prototype, handoff)
Figjam: User flows, wireframes
Stark: Accessibility checking plugin
Contrast: Color contrast checker

Development

Tailwind CSS: Utility-first CSS framework
Headless UI: Unstyled accessible components
Radix UI: Accessible component primitives
Framer Motion: Animation library
React Hook Form: Form management

Testing

Chrome DevTools: Inspect, debug
Lighthouse: Performance, accessibility audits
Responsively: Multi-device testing
BrowserStack: Cross-browser testing

Design Deliverables Checklist
For Developers

 Complete color palette with hex codes
 Typography scale with font families
 Component library in Figma
 Spacing and sizing system
 Icon library with naming conventions
 Screen mockups (mobile + desktop)
 User flows and navigation maps
 Interactive prototypes for complex flows
 Asset exports (logos, icons in SVG)
 Animation specifications
 Accessibility guidelines
 Design tokens (JSON/CSS variables)
