# Firebase Analytics Implementation

This document describes the Firebase Analytics implementation in DooSplit.

## Overview

Firebase Analytics has been integrated to track user behavior and app performance. The system automatically tracks various user actions and page views.

## Setup

### 1. Firebase Configuration
Analytics is initialized automatically when the app loads, provided that:
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` is set in environment variables
- Analytics is enabled via `NEXT_PUBLIC_ENABLE_ANALYTICS=true` (or running in production)

### 2. Analytics Provider
The `AnalyticsProvider` component wraps the entire app and handles:
- Analytics initialization
- User identification
- Automatic page view tracking
- JavaScript error tracking

## Tracked Events

### Authentication Events
- `login` - User logs in (tracks method: email/google)
- `logout` - User logs out
- `login_attempt` - Login attempt (tracks method)
- `login_failed` - Login failure (tracks method and error)

### Navigation Events
- `page_view` - Page visits (tracks path and title)
- `dashboard_view` - Specific dashboard page views

### Expense Events
- `expense_created` - Expense creation (tracks amount, currency, split method, participants, images)
- `image_uploaded` - Image uploads (tracks count and context)
- `image_upload_failed` - Failed image uploads (tracks error and context)

### Social Events
- `friend_request_sent` - Friend requests sent (tracks method)
- `friend_added` - Friends added (tracks method and friend type)
- `group_created` - Group creation (tracks member count, type, currency)

### Error Events
- `error_occurred` - JavaScript errors and unhandled promise rejections

## Implementation Details

### Files Added/Modified

1. `src/lib/firebase-analytics.ts` - Core analytics functions
2. `src/components/analytics/AnalyticsProvider.tsx` - React provider component
3. `src/components/Providers.tsx` - Updated to include AnalyticsProvider
4. Various page components - Added tracking calls

### Usage in Components

```typescript
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import { AnalyticsEvents } from "@/lib/firebase-analytics";

function MyComponent() {
  const { trackEvent } = useAnalytics();

  const handleAction = () => {
    trackEvent(AnalyticsEvents.EXPENSE_CREATED, {
      amount: 100,
      currency: 'USD',
      split_method: 'equally'
    });
  };

  return <button onClick={handleAction}>Create Expense</button>;
}
```

### Event Constants

All predefined events are available in `AnalyticsEvents` object:
- `LOGIN`, `LOGOUT`, `SIGNUP`
- `EXPENSE_CREATED`, `EXPENSE_EDITED`, `EXPENSE_DELETED`
- `FRIEND_ADDED`, `FRIEND_REQUEST_SENT`
- `GROUP_CREATED`, `GROUP_JOINED`
- `IMAGE_UPLOADED`
- `ERROR_OCCURRED`

## Configuration

### Environment Variables
```env
# Required for analytics to work
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_ENABLE_ANALYTICS=true  # Set to false to disable in development
```

### Analytics Initialization
Analytics only initializes in:
- Production environment (`NODE_ENV === 'production'`)
- OR when `NEXT_PUBLIC_ENABLE_ANALYTICS=true` is set

## Privacy & Compliance

- Analytics respects user privacy and only tracks functional usage
- User IDs are anonymized for tracking
- No personally identifiable information is tracked without explicit consent
- Error tracking helps improve app stability

## Monitoring

Analytics data can be viewed in:
1. Firebase Console > Analytics
2. Google Analytics dashboard
3. Real-time reports for immediate feedback

## Troubleshooting

### Analytics Not Working
1. Check `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` is set
2. Verify `NEXT_PUBLIC_ENABLE_ANALYTICS=true`
3. Check browser console for initialization messages
4. Ensure Firebase config includes measurementId

### Events Not Tracking
1. Verify component uses `useAnalytics()` hook
2. Check event names match `AnalyticsEvents` constants
3. Ensure user is authenticated for user-specific events
4. Check browser network tab for Firebase requests

## Future Enhancements

Potential improvements:
- Custom dashboards for analytics data
- User journey tracking
- Performance metrics
- Conversion funnel analysis
- A/B testing capabilities