# Testing Guide - Splitwise Web App

This document provides comprehensive testing instructions for all newly implemented and enhanced features.

## Pre-Testing Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   - Copy `.env.example` to `.env`
   - Configure all required environment variables
   - **Critical**: Set `ADMIN_EMAIL` and `ADMIN_PASSWORD`
   - **Important**: Configure SMTP settings for email functionality

3. **Database Setup**
   ```bash
   npm run seed  # Creates admin user
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

---

## Feature Testing

### 1. Notification System (NEW - 100%)

**Location**: `src/lib/notificationService.ts`

#### Test Cases:

**1.1 Expense Notifications**
- [ ] Create a new expense
  - Expected: Notification created for all participants except creator
  - Check: `/api/notifications` endpoint
  
- [ ] Update an expense
  - Expected: Notification sent to all participants
  - Verify: Notification message includes "updated"

- [ ] Delete an expense
  - Expected: Notification sent to all participants
  - Verify: Notification message includes "deleted"

**1.2 Settlement Notifications**
- [ ] Create a settlement
  - Expected: Both payer and payee receive notifications
  - Verify: Notification shows settlement amount

**1.3 Friend Request Notifications**
- [ ] Send friend request
  - Expected: Recipient gets notification
  
- [ ] Accept friend request
  - Expected: Requester gets "accepted" notification

**1.4 Group Invitation Notifications**
- [ ] Invite user to group
  - Expected: Invitee receives notification
  - Verify: Invitation link is included

#### API Endpoints to Test:
```bash
# Get user notifications
GET /api/notifications

# Mark notification as read
PATCH /api/notifications/[id]

# Delete notification
DELETE /api/notifications/[id]
```

---

### 2. Export Functionality (NEW - 100%)

**Location**: `src/lib/exportUtils.ts`

#### Test Cases:

**2.1 Expense Export**
- [ ] Navigate to `/expenses`
- [ ] Click "Export" button
- [ ] Test Excel export
  - Verify: File downloads with `.xlsx` extension
  - Open file: Check all expense data is present
  
- [ ] Test PDF export
  - Verify: File downloads with `.pdf` extension
  - Open file: Check formatting and data

- [ ] Test CSV export
  - Verify: File downloads with `.csv` extension
  - Open in spreadsheet: Verify comma-separated values

**2.2 Analytics Export**
- [ ] Navigate to `/analytics`
- [ ] Generate analytics data
- [ ] Test all three export formats (Excel, PDF, CSV)
- [ ] Verify data accuracy against dashboard

#### Export Data Verification:
- Expense ID, Description, Amount
- Date, Category, Paid By
- Split Details
- Proper formatting (currency, dates)

---

### 3. Dynamic Dashboard Stats (ENHANCED - 100%)

**Location**: `src/app/dashboard/page.tsx`

#### Test Cases:

**3.1 Monthly Spending**
- [ ] View dashboard
- [ ] Verify "Monthly Spending" card shows current month total
- [ ] Create new expense
  - Expected: Monthly spending updates immediately
  
- [ ] Delete expense
  - Expected: Monthly spending decreases

**3.2 Active Groups**
- [ ] Verify "Active Groups" count
- [ ] Create new group
  - Expected: Count increases
  
- [ ] Leave or delete group
  - Expected: Count decreases

**3.3 Friends Count**
- [ ] Add new friend
  - Expected: Friends count updates

**3.4 Total Balance**
- [ ] Verify balance calculation
- [ ] Add expense where you owe money
  - Expected: Balance becomes negative or decreases
  
- [ ] Add expense where someone owes you
  - Expected: Balance becomes positive or increases

---

### 4. Group Detail Page (NEW - 100%)

**Location**: `src/app/groups/[id]/page.tsx`

#### Test Cases:

**4.1 Group Information**
- [ ] Navigate to a group detail page
- [ ] Verify group name and description
- [ ] Check member count
- [ ] Verify total expenses amount

**4.2 Members List**
- [ ] See all group members
- [ ] Verify each member's balance in the group
- [ ] Check positive/negative balance colors

**4.3 Recent Expenses**
- [ ] View recent expenses in the group
- [ ] Verify expense details (description, amount, date, paid by)
- [ ] Click expense to view details
- [ ] Test pagination (if more than 10 expenses)

**4.4 Add Expense**
- [ ] Click "Add Expense" button
- [ ] Fill expense form
- [ ] Submit and verify it appears in recent expenses

---

### 5. Invitation System (ENHANCED 90% → 100%)

**Location**: `src/app/api/invitations/[id]/route.ts`

#### Test Cases:

**5.1 Resend Invitation**
```bash
PUT /api/invitations/[id]
```
- [ ] Invite user to platform/group
- [ ] Call resend endpoint
  - Expected: Expiration date extended by 7 days
  - Expected: Email sent again (if SMTP configured)
  
- [ ] Check response includes new expiresAt date
- [ ] Try resending already accepted invitation
  - Expected: 400 error "Invitation already accepted"

**5.2 Cancel Invitation**
```bash
DELETE /api/invitations/[id]
```
- [ ] Create new invitation
- [ ] Call cancel endpoint
  - Expected: Status set to "cancelled"
  - Expected: 200 success response
  
- [ ] Try using cancelled invitation token
  - Expected: Cannot accept
  
- [ ] Try cancelling already accepted invitation
  - Expected: 400 error "Cannot cancel accepted invitation"

---

### 6. Balance Calculator (ENHANCED 80% → 100%)

**Location**: `src/lib/balanceCalculator.ts`, `src/app/api/groups/[id]/simplified-debts/route.ts`

#### Test Cases:

**6.1 Simplified Debts Algorithm**
```bash
GET /api/groups/[id]/simplified-debts
```

**Test Scenario 1: Simple Triangle**
- Setup:
  - User A paid $30, owes $10 (net: +$20)
  - User B paid $10, owes $30 (net: -$20)
  - User C paid $0, owes $0 (net: $0)
  
- Expected Original: 2 transactions
  - B → A: $20
  
- Expected Optimized: 1 transaction
  - B → A: $20

**Test Scenario 2: Complex Group**
- Setup:
  - User A: net +$50
  - User B: net -$30
  - User C: net -$20
  
- Expected Result:
  - Minimized transactions (2 transactions)
  - All balances settled

**6.2 Verification**
- [ ] Create group with 4+ members
- [ ] Add multiple expenses with different payers
- [ ] Call simplified-debts endpoint
- [ ] Verify response includes:
  ```json
  {
    "transactions": [...],
    "originalCount": 6,
    "optimizedCount": 3,
    "message": "Reduced from 6 to 3 transactions (50% reduction)"
  }
  ```

---

### 7. Email Notifications (ENHANCED 70% → 100%)

**Location**: `src/lib/email.ts`

**Prerequisites**: Configure SMTP in `.env`:
```env
EMAIL_FROM=your-email@example.com
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@example.com
EMAIL_PASSWORD=your-app-password
```

#### Test Cases:

**7.1 Password Reset Email**
- [ ] Go to `/auth/forgot-password`
- [ ] Enter email address
- [ ] Submit form
  - Expected: Email received with reset link
  - Expected: Link format: `http://localhost:3000/auth/reset-password?token=...`
  
- [ ] Click link in email
  - Expected: Redirected to reset password page
  
- [ ] Enter new password
  - Expected: Password updated successfully

**7.2 Expense Notification Email**
- [ ] Create expense with participants
  - Expected: Each participant receives email
  - Expected: Email includes expense details
  - Expected: HTML formatting with gradient header

**7.3 Settlement Notification Email**
- [ ] Create settlement
  - Expected: Both payer and payee receive email
  - Expected: Email shows settlement amount
  - Expected: Professional HTML template

**7.4 Email Template Verification**
- [ ] Check email has proper styling
- [ ] Verify gradient header (teal to blue)
- [ ] Check footer links work
- [ ] Test on mobile (responsive design)

---

### 8. Security Features (ENHANCED 35% → 100%)

**Location**: `src/lib/rateLimit.ts`, `src/lib/csrf.ts`, `src/lib/seedAdmin.ts`

#### Test Cases:

**8.1 Rate Limiting**

**Authentication Endpoints** (5 requests per 15 minutes)
```bash
# Test register endpoint
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email":"test'$i'@test.com","password":"password123","name":"Test"}'
done
```
- [ ] First 5 requests: Should succeed or fail validation
- [ ] 6th request: Should return 429 Too Many Requests
- [ ] Response includes headers:
  ```
  X-RateLimit-Limit: 5
  X-RateLimit-Remaining: 0
  X-RateLimit-Reset: [timestamp]
  Retry-After: [seconds]
  ```

**Password Reset** (3 requests per hour)
```bash
# Test forgot-password endpoint
for i in {1..4}; do
  curl -X POST http://localhost:3000/api/auth/forgot-password \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com"}'
  sleep 1
done
```
- [ ] First 3 requests: Should succeed
- [ ] 4th request: Should return 429

**API Endpoints** (100 requests per minute)
- [ ] Make 101 rapid API calls to any authenticated endpoint
- [ ] 101st request should be rate limited

**8.2 CSRF Protection**

```bash
# Get CSRF token
curl http://localhost:3000/api/csrf-token

# Use token in protected endpoint
curl -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: [token-from-above]" \
  -H "Cookie: csrf-token=[cookie-value]" \
  -d '{"description":"Test","amount":100}'
```

- [ ] Request without CSRF token: 403 Forbidden
- [ ] Request with invalid token: 403 Forbidden
- [ ] Request with valid token: Success
- [ ] GET requests: Should work without CSRF token

**8.3 Secure Admin Credentials**

- [ ] Check `src/lib/seedAdmin.ts` has NO hardcoded credentials
- [ ] Run seed without ADMIN_EMAIL in .env
  - Expected: Error "ADMIN_EMAIL environment variable is required"
  
- [ ] Run seed without ADMIN_PASSWORD
  - Expected: Error "ADMIN_PASSWORD environment variable is required"
  
- [ ] Set weak password (< 8 characters)
  - Expected: Error "Admin password must be at least 8 characters long"
  
- [ ] Verify password is hashed (bcrypt cost 12)
  ```javascript
  // In MongoDB, admin password should start with $2b$12$
  ```

**8.4 Token Bucket Algorithm**
- [ ] Verify rate limit resets after window expires
- [ ] Test concurrent requests from same IP
- [ ] Test requests from different IPs (should have separate limits)
- [ ] Verify cleanup runs (check logs for "Cleaned up X expired rate limit entries")

---

## Integration Testing

### End-to-End User Flow

**Scenario: New User Signs Up and Creates Expense**

1. [ ] User registers account
   - Notifications created for any pending invitations
   
2. [ ] User logs in
   - Dashboard shows correct initial stats
   
3. [ ] User adds friends
   - Friend requests send notifications
   
4. [ ] User creates group
   - Active groups count increases
   
5. [ ] User creates expense
   - Notifications sent to participants
   - Monthly spending updates
   - Balance calculations update
   
6. [ ] User views group details
   - See members and balances
   - Recent expenses displayed
   
7. [ ] User exports expenses
   - Download Excel/PDF/CSV
   
8. [ ] User views simplified debts
   - Optimized transactions shown
   
9. [ ] User creates settlement
   - Notifications sent
   - Email notifications delivered

---

## Performance Testing

### Response Times
- [ ] Dashboard loads in < 2 seconds
- [ ] Export generation < 3 seconds (for 100 expenses)
- [ ] Notification creation < 500ms
- [ ] Simplified debts calculation < 1 second

### Load Testing
- [ ] 10 concurrent users
- [ ] 100 notifications in database
- [ ] 1000 expenses in database
- [ ] Export with 500+ records

---

## Security Testing Checklist

- [ ] No hardcoded credentials in codebase
- [ ] All API routes require authentication (except public ones)
- [ ] Rate limiting active on all auth endpoints
- [ ] CSRF protection on all mutation endpoints
- [ ] Passwords hashed with bcrypt (cost 12+)
- [ ] Password reset tokens expire after 1 hour
- [ ] Invitation tokens expire after 7 days
- [ ] SQL injection protection (using Mongoose)
- [ ] XSS protection (React escaping + sanitization)
- [ ] HTTPS in production (check Vercel deployment)

---

## Browser Testing

Test in multiple browsers:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

---

## Error Handling Testing

### Network Errors
- [ ] Offline: Show appropriate error messages
- [ ] Slow connection: Loading states work
- [ ] API timeout: Graceful degradation

### Validation Errors
- [ ] Empty form submissions
- [ ] Invalid email formats
- [ ] Password too short
- [ ] Amounts with invalid characters
- [ ] Future dates (where not allowed)

### Edge Cases
- [ ] Empty expense list export
- [ ] Group with no members
- [ ] Notifications when user deleted
- [ ] Simplified debts with 1 member
- [ ] Division by zero in balance calculations

---

## Automated Testing (TODO)

Consider adding:
```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

---

## Troubleshooting

### Emails Not Sending
1. Check SMTP credentials in `.env`
2. Verify EMAIL_HOST and EMAIL_PORT
3. For Gmail: Use App Password, not regular password
4. Check firewall/network settings

### Rate Limiting Too Strict
1. Adjust values in `src/lib/rateLimit.ts`
2. Clear rate limit store (restart server)
3. Disable in development: Set `ENABLE_RATE_LIMIT=false`

### CSRF Errors
1. Ensure cookies are enabled
2. Check SameSite cookie settings
3. Disable in development: Set `ENABLE_CSRF_PROTECTION=false`

### Notifications Not Created
1. Check database connection
2. Verify notificationService imports
3. Check console for errors
4. Verify user IDs exist

---

## Reporting Issues

When reporting bugs, include:
1. Steps to reproduce
2. Expected vs actual behavior
3. Browser/OS information
4. Console errors (F12 Developer Tools)
5. Network requests (Network tab)
6. Screenshots/videos

---

## Next Steps After Testing

1. ✅ All tests passing → Deploy to staging
2. ❌ Tests failing → Fix issues, retest
3. 📊 Performance issues → Optimize, profile
4. 🔒 Security concerns → Review, patch
5. 📚 Missing features → Document, prioritize

---

**Last Updated**: December 2024  
**Version**: 2.0.0
