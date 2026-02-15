"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "@/lib/auth/react-session";
import AppShell from "@/components/layout/AppShell";
import { useTheme } from "@/contexts/ThemeContext";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import {
  User,
  Lock,
  Bell,
  Moon,
  Sun,
  Globe,
  ChevronRight,
  Check,
  AlertCircle,
  LogOut,
  Save,
  Eye,
  EyeOff,
  Users,
  Trash2,
  Loader2,
} from "lucide-react";

interface UserProfile {
  name: string;
  email: string;
  phone?: string;
  defaultCurrency?: string;
  language?: string;
  profilePicture?: string;
}

interface FriendItem {
  id: string;
  friend: {
    id: string;
    name: string;
    email: string;
    isDummy?: boolean;
  };
  balance: number;
}

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession();

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // Notification settings
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(false);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);

  // Theme context
  const { theme, toggleTheme } = useTheme();

  // Currency state
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState("INR");
  const [savingCurrency, setSavingCurrency] = useState(false);

  // Friends state
  const [friendsList, setFriendsList] = useState<FriendItem[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);

  const currencies = [
    { code: "INR", symbol: "₹", label: "Indian Rupee" },
    { code: "USD", symbol: "$", label: "US Dollar" },
    { code: "EUR", symbol: "€", label: "Euro" },
    { code: "GBP", symbol: "£", label: "British Pound" },
    { code: "AUD", symbol: "A$", label: "Australian Dollar" },
    { code: "CAD", symbol: "C$", label: "Canadian Dollar" },
    { code: "JPY", symbol: "¥", label: "Japanese Yen" },
  ];

  useEffect(() => {
    fetchProfile();
    fetchFriendsList();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/user/profile");
      if (res.ok) {
        const data = await res.json();
        setProfile(data.user);
        setProfileForm({
          name: data.user.name || "",
          phone: data.user.phone || "",
        });
        setSelectedCurrency(data.user.defaultCurrency || "INR");
        setPushNotificationsEnabled(data.user.pushNotificationsEnabled || false);
        setEmailNotificationsEnabled(data.user.emailNotificationsEnabled !== false);
      }
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setLoadingProfile(false);
    }
  };

  const fetchFriendsList = async () => {
    try {
      const res = await fetch("/api/friends");
      if (res.ok) {
        const data = await res.json();
        setFriendsList(data.friends || []);
      }
    } catch (error) {
      console.error("Failed to fetch friends:", error);
    } finally {
      setLoadingFriends(false);
    }
  };

  const removeFriend = async (friendshipId: string) => {
    if (!confirm("Remove this friend? This cannot be undone.")) return;
    setRemovingFriendId(friendshipId);
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setFriendsList((prev) => prev.filter((f) => f.id !== friendshipId));
      }
    } catch (error) {
      console.error("Failed to remove friend:", error);
    } finally {
      setRemovingFriendId(null);
    }
  };

  const handleProfileSave = async () => {
    if (!profileForm.name.trim()) {
      setProfileMsg({ type: "error", text: "Name is required" });
      return;
    }
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileForm.name,
          phone: profileForm.phone,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setProfileMsg({ type: "success", text: "Profile updated successfully!" });
        setProfile((prev) => (prev ? { ...prev, name: profileForm.name, phone: profileForm.phone } : prev));
        await updateSession({ name: profileForm.name });
        setTimeout(() => setShowProfileModal(false), 1200);
      } else {
        setProfileMsg({ type: "error", text: data.error || "Failed to update profile" });
      }
    } catch {
      setProfileMsg({ type: "error", text: "Something went wrong" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSave = async () => {
    setPasswordMsg(null);
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      setPasswordMsg({ type: "error", text: "All password fields are required" });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordMsg({ type: "error", text: "New password must be at least 6 characters" });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMsg({ type: "error", text: "New passwords do not match" });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordMsg({ type: "success", text: "Password changed successfully!" });
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setTimeout(() => setShowPasswordModal(false), 1200);
      } else {
        setPasswordMsg({ type: "error", text: data.error || "Failed to change password" });
      }
    } catch {
      setPasswordMsg({ type: "error", text: "Something went wrong" });
    } finally {
      setSavingPassword(false);
    }
  };


  const handleCurrencySave = async () => {
    setSavingCurrency(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultCurrency: selectedCurrency }),
      });
      if (res.ok) {
        setProfile((prev) => (prev ? { ...prev, defaultCurrency: selectedCurrency } : prev));
        setShowCurrencyModal(false);
      }
    } catch {
      console.error("Failed to update currency");
    } finally {
      setSavingCurrency(false);
    }
  };

  const togglePushNotifications = async () => {
    try {
      const newValue = !pushNotificationsEnabled;
      setPushNotificationsEnabled(newValue);

      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushNotificationsEnabled: newValue }),
      });

      if (!res.ok) {
        // Revert on error
        setPushNotificationsEnabled(!newValue);
        console.error("Failed to update push notifications setting");
      }
    } catch (error) {
      // Revert on error
      setPushNotificationsEnabled(!pushNotificationsEnabled);
      console.error("Failed to toggle push notifications:", error);
    }
  };

  const toggleEmailNotifications = async () => {
    try {
      const newValue = !emailNotificationsEnabled;
      setEmailNotificationsEnabled(newValue);

      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailNotificationsEnabled: newValue }),
      });

      if (!res.ok) {
        // Revert on error
        setEmailNotificationsEnabled(!newValue);
        console.error("Failed to update email notifications setting");
      }
    } catch (error) {
      // Revert on error
      setEmailNotificationsEnabled(!emailNotificationsEnabled);
      console.error("Failed to toggle email notifications:", error);
    }
  };

  return (
    <AppShell>
      <div className="p-4 md:p-8 space-y-6 max-w-2xl mx-auto">
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
            <div className="space-y-1">
              <button
                onClick={() => {
                  setProfileMsg(null);
                  setShowProfileModal(true);
                }}
                className="flex items-center w-full p-3 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary transition-colors"
              >
                <User className="h-5 w-5 text-neutral-500 mr-3" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">Profile</p>
                  <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary">
                    {loadingProfile ? "Loading..." : profile?.name || "Update your profile information"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-neutral-400" />
              </button>
              <button
                onClick={() => {
                  setPasswordMsg(null);
                  setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
                  setShowPasswordModal(true);
                }}
                className="flex items-center w-full p-3 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary transition-colors"
              >
                <Lock className="h-5 w-5 text-neutral-500 mr-3" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">Password</p>
                  <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary">Change your password</p>
                </div>
                <ChevronRight className="h-4 w-4 text-neutral-400" />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <button
                onClick={() => setShowCurrencyModal(true)}
                className="flex items-center w-full p-3 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary transition-colors"
              >
                <Globe className="h-5 w-5 text-neutral-500 mr-3" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">Currency</p>
                  <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary">
                    {currencies.find((c) => c.code === selectedCurrency)?.symbol || "₹"}{" "}
                    {selectedCurrency}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-neutral-400" />
              </button>
              <button
                onClick={toggleTheme}
                className="flex items-center w-full p-3 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary transition-colors"
              >
                {theme === "light" ? (
                  <Moon className="h-5 w-5 text-neutral-500 mr-3" />
                ) : (
                  <Sun className="h-5 w-5 text-amber-500 mr-3" />
                )}
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">Theme</p>
                  <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary">
                    {theme === "light" ? "Light mode" : "Dark mode"}
                  </p>
                </div>
                <div
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    theme === "dark" ? "bg-primary" : "bg-neutral-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      theme === "dark" ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </div>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Friends */}
        <Card>
          <CardHeader>
            <CardTitle>Friends</CardTitle>
          </CardHeader>
          <CardContent>
            <button
              onClick={() => setShowFriendsModal(true)}
              className="flex items-center w-full p-3 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary transition-colors"
            >
              <Users className="h-5 w-5 text-neutral-500 mr-3" />
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">
                  Manage Friends
                </p>
                <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary">
                  {loadingFriends
                    ? "Loading..."
                    : `${friendsList.length} friend${friendsList.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-neutral-400" />
            </button>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Push Notifications */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">
                  Push Notifications
                </p>
                <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary">
                  Receive notifications in your browser
                </p>
              </div>
              <button
                onClick={togglePushNotifications}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                  pushNotificationsEnabled
                    ? "bg-primary"
                    : "bg-neutral-200 dark:bg-dark-border"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    pushNotificationsEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Email Notifications */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">
                  Email Notifications
                </p>
                <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary">
                  Receive notifications via email
                </p>
              </div>
              <button
                onClick={toggleEmailNotifications}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                  emailNotificationsEnabled
                    ? "bg-primary"
                    : "bg-neutral-200 dark:bg-dark-border"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    emailNotificationsEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Logout */}
        <Card>
          <CardContent className="py-2">
            <button
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
              className="flex items-center w-full p-3 rounded-md hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-red-600 dark:text-red-400"
            >
              <LogOut className="h-5 w-5 mr-3" />
              <p className="text-sm font-medium">Sign Out</p>
            </button>
          </CardContent>
        </Card>

        {/* Profile Modal */}
        <Modal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          title="Edit Profile"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text-secondary mb-1">
                Email
              </label>
              <p className="text-sm text-neutral-500 bg-neutral-50 dark:bg-dark-bg-tertiary px-3 py-2.5 rounded-lg">
                {profile?.email}
              </p>
            </div>
            <Input
              label="Name"
              value={profileForm.name}
              onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Your name"
            />
            <Input
              label="Phone (optional)"
              value={profileForm.phone}
              onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+91 9876543210"
            />

            {profileMsg && (
              <div
                className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                  profileMsg.type === "success"
                    ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                    : "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
                }`}
              >
                {profileMsg.type === "success" ? (
                  <Check className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                )}
                {profileMsg.text}
              </div>
            )}

            <Button onClick={handleProfileSave} variant="primary" className="w-full" isLoading={savingProfile}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </Modal>

        {/* Password Modal */}
        <Modal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
          title="Change Password"
        >
          <div className="space-y-4">
            <div className="relative">
              <Input
                label="Current Password"
                type={showCurrentPw ? "text" : "password"}
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))
                }
                placeholder="Enter current password"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPw(!showCurrentPw)}
                className="absolute right-3 top-[34px] text-neutral-400 hover:text-neutral-600"
              >
                {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="relative">
              <Input
                label="New Password"
                type={showNewPw ? "text" : "password"}
                value={passwordForm.newPassword}
                onChange={(e) =>
                  setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))
                }
                placeholder="At least 6 characters"
              />
              <button
                type="button"
                onClick={() => setShowNewPw(!showNewPw)}
                className="absolute right-3 top-[34px] text-neutral-400 hover:text-neutral-600"
              >
                {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Input
              label="Confirm New Password"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))
              }
              placeholder="Re-enter new password"
            />

            {passwordMsg && (
              <div
                className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                  passwordMsg.type === "success"
                    ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                    : "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
                }`}
              >
                {passwordMsg.type === "success" ? (
                  <Check className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                )}
                {passwordMsg.text}
              </div>
            )}

            <Button onClick={handlePasswordSave} variant="primary" className="w-full" isLoading={savingPassword}>
              <Lock className="h-4 w-4 mr-2" />
              Update Password
            </Button>
          </div>
        </Modal>

        {/* Currency Modal */}
        <Modal
          isOpen={showCurrencyModal}
          onClose={() => setShowCurrencyModal(false)}
          title="Select Currency"
          size="sm"
        >
          <div className="space-y-1">
            {currencies.map((currency) => (
              <button
                key={currency.code}
                onClick={() => setSelectedCurrency(currency.code)}
                className={`flex items-center w-full p-3 rounded-lg transition-colors ${
                  selectedCurrency === currency.code
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary text-neutral-700 dark:text-dark-text-secondary"
                }`}
              >
                <span className="w-8 text-lg">{currency.symbol}</span>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">{currency.code}</p>
                  <p className="text-xs text-neutral-500">{currency.label}</p>
                </div>
                {selectedCurrency === currency.code && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </button>
            ))}
            <div className="pt-3">
              <Button onClick={handleCurrencySave} variant="primary" className="w-full" isLoading={savingCurrency}>
                <Save className="h-4 w-4 mr-2" />
                Save Currency
              </Button>
            </div>
          </div>
        </Modal>

        {/* Friends Modal */}
        <Modal
          isOpen={showFriendsModal}
          onClose={() => setShowFriendsModal(false)}
          title="Your Friends"
        >
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {loadingFriends ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : friendsList.length === 0 ? (
              <p className="text-center py-8 text-neutral-500 dark:text-dark-text-tertiary text-sm">
                No friends yet. Add friends from the Friends page.
              </p>
            ) : (
              friendsList.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center p-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm mr-3 flex-shrink-0">
                    {item.friend.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-neutral-900 dark:text-dark-text truncate">
                        {item.friend.name}
                      </p>
                      {item.friend.isDummy && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                          Demo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary truncate">
                      {item.friend.isDummy ? "Placeholder friend" : item.friend.email}
                    </p>
                  </div>
                  <button
                    onClick={() => removeFriend(item.id)}
                    disabled={removingFriendId === item.id}
                    className="ml-2 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                    title="Remove friend"
                  >
                    {removingFriendId === item.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}

