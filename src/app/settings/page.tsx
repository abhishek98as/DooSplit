import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { User, Lock, Bell, Moon, Globe } from "lucide-react";

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="p-4 md:p-8 space-y-6">
        <div>
          <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
            Settings
          </h1>
          <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
            Manage your account and preferences.
          </p>
        </div>

        {/* Account Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center p-3 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary cursor-pointer">
                <User className="h-5 w-5 text-neutral-500 mr-3" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Profile</p>
                  <p className="text-xs text-neutral-500">Update your profile information</p>
                </div>
              </div>
              <div className="flex items-center p-3 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary cursor-pointer">
                <Lock className="h-5 w-5 text-neutral-500 mr-3" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Password</p>
                  <p className="text-xs text-neutral-500">Change your password</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center p-3 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary cursor-pointer">
                <Globe className="h-5 w-5 text-neutral-500 mr-3" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Currency</p>
                  <p className="text-xs text-neutral-500">INR (₹)</p>
                </div>
              </div>
              <div className="flex items-center p-3 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary cursor-pointer">
                <Moon className="h-5 w-5 text-neutral-500 mr-3" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Theme</p>
                  <p className="text-xs text-neutral-500">Light mode</p>
                </div>
              </div>
              <div className="flex items-center p-3 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary cursor-pointer">
                <Bell className="h-5 w-5 text-neutral-500 mr-3" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Notifications</p>
                  <p className="text-xs text-neutral-500">Manage notification preferences</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
