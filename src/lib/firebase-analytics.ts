import { getAnalytics, isSupported } from "firebase/analytics";
import { app } from "./firebase";

let analytics: any = null;

// Initialize Firebase Analytics
export const initializeAnalytics = async () => {
  try {
    // Only initialize analytics in production or when explicitly enabled
    const enableAnalytics = process.env.NODE_ENV === 'production' ||
                           process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true';

    // Only initialize analytics if it's supported (client-side and measurementId is available)
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID && enableAnalytics) {
      const isAnalyticsSupported = await isSupported();
      if (isAnalyticsSupported) {
        analytics = getAnalytics(app);
        console.log("✅ Firebase Analytics initialized");
      } else {
        console.log("⚠️ Firebase Analytics not supported in this environment");
      }
    } else {
      console.log("⚠️ Firebase Analytics not initialized (server-side, missing measurementId, or disabled)");
    }
  } catch (error) {
    console.error("❌ Failed to initialize Firebase Analytics:", error);
  }
  return analytics;
};

// Get analytics instance
export const getAnalyticsInstance = () => analytics;

// Log events
export const logEvent = (eventName: string, parameters?: Record<string, any>) => {
  if (analytics && typeof window !== 'undefined') {
    try {
      // Import dynamically to avoid SSR issues
      import('firebase/analytics').then(({ logEvent: firebaseLogEvent }) => {
        firebaseLogEvent(analytics, eventName, parameters);
      });
    } catch (error) {
      console.error("Failed to log analytics event:", error);
    }
  }
};

// Log user properties
export const setUserProperties = (properties: Record<string, any>) => {
  if (analytics && typeof window !== 'undefined') {
    try {
      import('firebase/analytics').then(({ setUserProperties: firebaseSetUserProperties }) => {
        firebaseSetUserProperties(analytics, properties);
      });
    } catch (error) {
      console.error("Failed to set user properties:", error);
    }
  }
};

// Set user ID
export const setUserId = (userId: string) => {
  if (analytics && typeof window !== 'undefined') {
    try {
      import('firebase/analytics').then(({ setUserId: firebaseSetUserId }) => {
        firebaseSetUserId(analytics, userId);
      });
    } catch (error) {
      console.error("Failed to set user ID:", error);
    }
  }
};

// Predefined event types for common actions
export const AnalyticsEvents = {
  // Authentication
  LOGIN: 'login',
  SIGNUP: 'sign_up',
  LOGOUT: 'logout',

  // Navigation
  PAGE_VIEW: 'page_view',
  DASHBOARD_VIEW: 'dashboard_view',

  // Expenses
  EXPENSE_CREATED: 'expense_created',
  EXPENSE_EDITED: 'expense_edited',
  EXPENSE_DELETED: 'expense_deleted',
  EXPENSE_VIEWED: 'expense_viewed',

  // Friends
  FRIEND_ADDED: 'friend_added',
  FRIEND_REQUEST_SENT: 'friend_request_sent',
  FRIEND_REQUEST_ACCEPTED: 'friend_request_accepted',

  // Groups
  GROUP_CREATED: 'group_created',
  GROUP_JOINED: 'group_joined',

  // Images
  IMAGE_UPLOADED: 'image_uploaded',

  // Settings
  SETTINGS_UPDATED: 'settings_updated',

  // Errors
  ERROR_OCCURRED: 'error_occurred',
} as const;