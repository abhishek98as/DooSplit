"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/auth/react-session";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import { AnalyticsEvents } from "@/lib/firebase-analytics";
import getOfflineStore from "@/lib/offline-store";
import {
  UserPlus,
  Search,
  Users,
  Check,
  X,
  Mail,
  Send,
  Link2,
  Copy,
  CheckCircle2,
  AlertCircle,
  Trash2,
  UserRoundPlus,
  Clock,
  Loader2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Receipt,
} from "lucide-react";
import Link from "next/link";

interface FriendItem {
  id: string;
  friend: {
    id: string;
    name: string;
    email: string;
    profilePicture?: string;
    isDummy?: boolean;
  };
  balance: number;
}

interface FriendRequest {
  id: string;
  from: {
    id: string;
    name: string;
    email: string;
    profilePicture?: string;
  };
  createdAt: string;
}

interface SearchUser {
  id: string;
  name: string;
  email: string;
  profilePicture?: string;
  friendshipStatus: string;
}

interface InvitationItem {
  _id: string;
  email: string;
  status: "pending" | "accepted" | "expired";
  createdAt: string;
  expiresAt: string;
}

type FilterType = "all" | "outstanding" | "i_owe" | "owed";

function formatINR(amount: number): string {
  return `₹${Math.abs(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getAvatarColor(name: string): string {
  const palette = [
    "#1A2C40",
    "#C0392B",
    "#1E3A5F",
    "#E67E22",
    "#8E44AD",
    "#117A65",
    "#B7950B",
    "#17202A",
    "#6C757D",
    "#1A5276",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function getInitials(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

export default function FriendsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { trackEvent } = useAnalytics();

  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [showSettled, setShowSettled] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [settlingAll, setSettlingAll] = useState(false);
  const [showSettleAllConfirm, setShowSettleAllConfirm] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Dummy friend state
  const [dummyName, setDummyName] = useState("");
  const [creatingDummy, setCreatingDummy] = useState(false);
  const [dummyResult, setDummyResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{
    type: "success" | "error";
    message: string;
    inviteLink?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Tab in modal
  const [modalTab, setModalTab] = useState<"search" | "dummy" | "invite">("search");

  useEffect(() => {
    const timer = window.setTimeout(() => setIsReady(true), 20);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    } else if (status === "authenticated") {
      void fetchFriends();
      void fetchRequests();
      void fetchInvitations();
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ domains?: string[] }>).detail;
      const domains = detail?.domains || [];
      if (
        domains.includes("friends") ||
        domains.includes("expenses") ||
        domains.includes("settlements") ||
        domains.includes("groups") ||
        domains.includes("activity")
      ) {
        void fetchFriends();
        void fetchRequests();
        void fetchInvitations();
      }
    };

    window.addEventListener("doosplit:data-updated", handler as EventListener);
    return () => {
      window.removeEventListener("doosplit:data-updated", handler as EventListener);
    };
  }, [status]);

  const fetchFriends = async () => {
    try {
      const offlineStore = getOfflineStore();
      const rawFriends = await offlineStore.getFriends();
      const normalized = (rawFriends || []).map((item: any) => ({
        id: item.id,
        friend: {
          id: item.friend?._id || item.friend?.id,
          name: item.friend?.name || item.name || "Unknown",
          email: item.friend?.email || item.email || "",
          profilePicture: item.friend?.profilePicture,
          isDummy: item.friend?.isDummy,
        },
        balance: Number(item.balance ?? 0),
      }));
      setFriends(normalized.filter((f: FriendItem) => f.id && f.friend?.id));
    } catch (error) {
      console.error("Failed to fetch friends:", error);
      setFriends([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      const res = await fetch("/api/friends/requests", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error("Failed to fetch friend requests:", error);
    }
  };

  const fetchInvitations = async () => {
    try {
      const res = await fetch("/api/invitations", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations || []);
      }
    } catch {
      // silent
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setSearching(true);
    setHasSearched(true);
    setInviteResult(null);
    try {
      const res = await fetch(
        `/api/friends/search?query=${encodeURIComponent(searchQuery.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.users || []);
      }
    } catch (error) {
      console.error("Failed to search users:", error);
    } finally {
      setSearching(false);
    }
  };

  const sendFriendRequest = async (friendId: string) => {
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: friendId }),
      });

      if (res.ok) {
        trackEvent(AnalyticsEvents.FRIEND_REQUEST_SENT, {
          method: "user_search",
        });
        setSearchResults((prev) =>
          prev.map((user) =>
            user.id === friendId
              ? { ...user, friendshipStatus: "pending" }
              : user
          )
        );
      }
    } catch (error) {
      console.error("Failed to send friend request:", error);
    }
  };

  const createDummyFriend = async () => {
    if (!dummyName.trim()) return;
    setCreatingDummy(true);
    setDummyResult(null);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dummyName: dummyName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        trackEvent(AnalyticsEvents.FRIEND_ADDED, {
          method: "dummy_friend",
          friend_type: "placeholder",
        });
        setDummyResult({
          type: "success",
          message: `"${dummyName.trim()}" added as a placeholder friend!`,
        });
        setDummyName("");
        await fetchFriends();
      } else {
        setDummyResult({
          type: "error",
          message: data.error || "Failed to create dummy friend",
        });
      }
    } catch {
      setDummyResult({ type: "error", message: "Something went wrong" });
    } finally {
      setCreatingDummy(false);
    }
  };

  const sendInviteFromModal = async (emailToInvite?: string) => {
    const targetEmail = (emailToInvite || inviteEmail).trim();
    if (!targetEmail) return;

    setSendingInvite(true);
    setInviteResult(null);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        setInviteResult({ type: "error", message: data.error });
        return;
      }

      const mode = String(data.mode || "");
      if (mode === "friend_request_created") {
        setInviteResult({
          type: "success",
          message: `User already has DooSplit. Friend request sent to ${targetEmail}.`,
        });
        setInviteEmail("");
        await fetchFriends();
        await fetchRequests();
        return;
      }
      if (mode === "already_friends") {
        setInviteResult({
          type: "success",
          message: "You are already friends with this user.",
        });
        setInviteEmail("");
        return;
      }
      if (mode === "already_pending") {
        setInviteResult({
          type: "success",
          message: "A friend request is already pending for this user.",
        });
        setInviteEmail("");
        return;
      }
      if (mode === "auto_accepted_pending") {
        setInviteResult({
          type: "success",
          message: "Pending request was auto-accepted. You are now friends.",
        });
        setInviteEmail("");
        await fetchFriends();
        await fetchRequests();
        return;
      }

      setInviteResult({
        type: "success",
        message: data.emailSent
          ? `Invitation sent to ${targetEmail}.`
          : "Invitation created. Share the link manually.",
        inviteLink: data.invitation?.inviteLink,
      });
      setInviteEmail("");
      await fetchInvitations();
    } catch {
      setInviteResult({ type: "error", message: "Something went wrong" });
    } finally {
      setSendingInvite(false);
    }
  };

  const removeFriend = async (friendshipId: string) => {
    if (!confirm("Remove this friend? This cannot be undone.")) return;
    setRemovingId(friendshipId);
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setFriends((prev) => prev.filter((f) => f.id !== friendshipId));
      }
    } catch (error) {
      console.error("Failed to remove friend:", error);
    } finally {
      setRemovingId(null);
    }
  };

  const handleReinvite = async (invitationId: string) => {
    setProcessingInviteId(invitationId);
    try {
      const res = await fetch(`/api/invitations/${invitationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteResult({
          type: "error",
          message: data.error || "Failed to resend invitation",
        });
        return;
      }
      setInviteResult({
        type: "success",
        message: data.emailSent
          ? "Invitation resent successfully."
          : "Invitation refreshed, but email could not be sent.",
      });
      await fetchInvitations();
    } catch {
      setInviteResult({
        type: "error",
        message: "Failed to resend invitation",
      });
    } finally {
      setProcessingInviteId(null);
    }
  };

  const handleCancelInvite = async (invitationId: string) => {
    setProcessingInviteId(invitationId);
    try {
      const res = await fetch(`/api/invitations/${invitationId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteResult({
          type: "error",
          message: data.error || "Failed to cancel invitation",
        });
        return;
      }
      setInviteResult({
        type: "success",
        message: "Invitation cancelled.",
      });
      await fetchInvitations();
    } catch {
      setInviteResult({
        type: "error",
        message: "Failed to cancel invitation",
      });
    } finally {
      setProcessingInviteId(null);
    }
  };

  const handleRequest = async (requestId: string, action: "accept" | "reject") => {
    try {
      const res = await fetch(`/api/friends/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (res.ok) {
        if (action === "accept") {
          trackEvent(AnalyticsEvents.FRIEND_REQUEST_ACCEPTED, {
            method: "incoming_request",
          });
        }
        await fetchFriends();
        await fetchRequests();
      }
    } catch (error) {
      console.error("Failed to handle friend request:", error);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleSettleAll = async () => {
    if (!session?.user?.id) {
      return;
    }

    const outstanding = friends.filter((item) => Math.abs(item.balance) > 0.01);
    if (outstanding.length === 0) {
      setShowSettleAllConfirm(false);
      return;
    }

    setSettlingAll(true);
    try {
      for (const item of outstanding) {
        const amount = Math.abs(item.balance);
        const fromUserId = item.balance > 0 ? item.friend.id : session.user.id;
        const toUserId = item.balance > 0 ? session.user.id : item.friend.id;

        const res = await fetch("/api/settlements", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fromUserId,
            toUserId,
            amount,
            currency: "INR",
            method: "upi",
            note: "Settled using Settle All",
            date: new Date().toISOString(),
          }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to settle one or more balances");
        }
      }

      setShowSettleAllConfirm(false);
      await fetchFriends();
      window.dispatchEvent(
        new CustomEvent("doosplit:data-updated", {
          detail: {
            domains: ["friends", "settlements", "analytics", "dashboard", "activity"],
            reason: "settle-all-friends",
            at: Date.now(),
          },
        })
      );
    } catch (error) {
      console.error("Failed to settle all:", error);
      alert(error instanceof Error ? error.message : "Failed to settle all balances");
    } finally {
      setSettlingAll(false);
    }
  };

  const resetModal = () => {
    setShowAddModal(false);
    setSearchQuery("");
    setSearchResults([]);
    setHasSearched(false);
    setInviteEmail("");
    setInviteResult(null);
    setDummyName("");
    setDummyResult(null);
    setModalTab("search");
  };

  const pendingInvitations = invitations.filter(
    (inv) => inv.status === "pending" && new Date(inv.expiresAt) > new Date()
  );

  const searchNormalized = searchQuery.trim().toLowerCase();
  const searchedFriends = useMemo(() => {
    if (!searchNormalized) {
      return friends;
    }
    return friends.filter((item) => {
      const name = String(item.friend.name || "").toLowerCase();
      const email = String(item.friend.email || "").toLowerCase();
      return name.includes(searchNormalized) || email.includes(searchNormalized);
    });
  }, [friends, searchNormalized]);

  const settledFriends = useMemo(
    () => searchedFriends.filter((item) => Math.abs(item.balance) <= 0.01),
    [searchedFriends]
  );

  const activeBase = useMemo(
    () => searchedFriends.filter((item) => Math.abs(item.balance) > 0.01),
    [searchedFriends]
  );

  const activeFriends = useMemo(() => {
    if (filterType === "i_owe") {
      return activeBase.filter((item) => item.balance < 0);
    }
    if (filterType === "owed") {
      return activeBase.filter((item) => item.balance > 0);
    }
    if (filterType === "outstanding") {
      return activeBase;
    }
    return activeBase;
  }, [activeBase, filterType]);

  const overallBalance = useMemo(
    () => searchedFriends.reduce((sum, item) => sum + item.balance, 0),
    [searchedFriends]
  );

  const displayBalance = useMemo(() => {
    if (filterType === "owed") {
      const amount = activeBase
        .filter((item) => item.balance > 0)
        .reduce((sum, item) => sum + item.balance, 0);
      return {
        amount,
        isPositive: true,
        label: "Overall, owed to you",
      };
    }
    if (filterType === "i_owe") {
      const amount = Math.abs(
        activeBase
          .filter((item) => item.balance < 0)
          .reduce((sum, item) => sum + item.balance, 0)
      );
      return {
        amount,
        isPositive: false,
        label: "Overall, you owe",
      };
    }

    return {
      amount: Math.abs(overallBalance),
      isPositive: overallBalance >= 0,
      label: overallBalance >= 0 ? "Overall, owed to you" : "Overall, you owe",
    };
  }, [activeBase, filterType, overallBalance]);

  const isEmailQuery = (q: string) => /^\S+@\S+\.\S+$/.test(q.trim());

  if (status === "loading" || loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div
        className={`relative p-4 md:p-8 space-y-6 pb-28 transition-all duration-300 ${
          isReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="md:hidden">
            <h1 className="text-h1 font-display font-bold text-neutral-900 dark:text-dark-text">
              Friends
            </h1>
            <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
              Track balances and settle faster
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsSearchVisible((prev) => {
                  if (prev) {
                    setSearchQuery("");
                  }
                  return !prev;
                });
              }}
              className="!px-3"
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button onClick={() => setShowAddModal(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Friend
            </Button>
          </div>
        </div>

        <div
          className={`overflow-hidden transition-all duration-300 ${
            isSearchVisible ? "max-h-16 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <Input
            icon={<Search className="h-4 w-4" />}
            placeholder="Search friends by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div
          className="rounded-2xl bg-navy p-5"
          style={{
            boxShadow:
              "0 18px 45px rgba(17, 24, 39, 0.22), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[1px] text-white/50">
                {displayBalance.label}
              </p>
              <p
                className={`mt-1 text-2xl md:text-3xl font-display font-extrabold ${
                  displayBalance.isPositive ? "text-primary" : "text-coral"
                }`}
              >
                {formatINR(displayBalance.amount)}
              </p>
            </div>
            <Button
              onClick={() => setShowSettleAllConfirm(true)}
              disabled={activeBase.length === 0 || settlingAll}
              className="!h-10 !px-4 !text-sm !font-semibold"
            >
              {settlingAll ? "Settling..." : "Settle All"}
            </Button>
          </div>
        </div>

        <div className="-mx-1 px-1 overflow-x-auto">
          <div className="inline-flex gap-2 min-w-max">
            {[
              { key: "all" as const, label: "All Friends" },
              { key: "outstanding" as const, label: "Outstanding" },
              { key: "i_owe" as const, label: "I Owe" },
              { key: "owed" as const, label: "Owed to Me" },
            ].map((chip) => {
              const active = filterType === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setFilterType(chip.key)}
                  className={`rounded-full border px-4 py-2 text-sm transition-all ${
                    active
                      ? "bg-navy border-navy text-white"
                      : "bg-white border-neutral-200 text-neutral-600 hover:border-primary hover:text-primary dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text-secondary"
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {requests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Friend Requests ({requests.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {requests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between py-2 border-b border-neutral-200 dark:border-dark-border last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <span className="text-primary font-semibold">
                          {request.from.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900 dark:text-dark-text truncate">
                          {request.from.name}
                        </p>
                        <p className="text-sm text-neutral-500 truncate">{request.from.email}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleRequest(request.id, "accept")}
                        variant="primary"
                        className="!px-3 !py-1"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleRequest(request.id, "reject")}
                        variant="destructive"
                        className="!px-3 !py-1"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {pendingInvitations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pending Invitations ({pendingInvitations.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingInvitations.map((inv) => (
                  <div
                    key={inv._id}
                    className="flex items-center justify-between py-2 border-b border-neutral-200 dark:border-dark-border last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                        <Mail className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900 dark:text-dark-text truncate">
                          {inv.email}
                        </p>
                        <p className="text-xs text-neutral-400">
                          Invited {new Date(inv.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        <Clock className="h-3 w-3" />
                        Pending
                      </span>
                      <button
                        type="button"
                        onClick={() => handleReinvite(inv._id)}
                        disabled={processingInviteId === inv._id}
                        className="p-1.5 rounded-md text-neutral-500 hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Reinvite"
                      >
                        {processingInviteId === inv._id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancelInvite(inv._id)}
                        disabled={processingInviteId === inv._id}
                        className="p-1.5 rounded-md text-neutral-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-50/10 transition-colors"
                        title="Cancel invite"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Active Balances ({activeFriends.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {friends.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto mb-3 text-neutral-300" />
                <p className="text-body text-neutral-500 dark:text-dark-text-secondary">No friends yet</p>
                <p className="text-sm text-neutral-400 dark:text-dark-text-tertiary mt-2">
                  Start by adding friends to track expenses together
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center mt-4">
                  <Button
                    onClick={() => {
                      setModalTab("search");
                      setShowAddModal(true);
                    }}
                    variant="primary"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Search & Add
                  </Button>
                  <Button
                    onClick={() => {
                      setModalTab("dummy");
                      setShowAddModal(true);
                    }}
                    variant="secondary"
                  >
                    <UserRoundPlus className="h-4 w-4 mr-2" />
                    Add Demo Friend
                  </Button>
                  <Button
                    onClick={() => {
                      setModalTab("invite");
                      setShowAddModal(true);
                    }}
                    variant="secondary"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Invite
                  </Button>
                </div>
              </div>
            ) : activeFriends.length === 0 ? (
              <div className="text-center py-10 text-neutral-500 dark:text-dark-text-secondary">
                <p className="font-medium">No active balances for this filter.</p>
                <p className="text-sm mt-1">Try a different filter or expand settled friends.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeFriends.map((item, index) => {
                  const isYouOwe = item.balance < 0;
                  const statusColor = isYouOwe
                    ? "bg-coral"
                    : "bg-primary";
                  const amountColor = isYouOwe
                    ? "text-coral"
                    : "text-tealDark";

                  return (
                    <div
                      key={item.id}
                      style={{ transitionDelay: `${Math.min(index * 50, 300)}ms` }}
                      className={`group relative flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 dark:bg-dark-bg-secondary dark:border-dark-border ${
                        isReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => router.push(`/friends/${item.friend.id}`)}
                        className="absolute inset-0 rounded-2xl"
                        aria-label={`Open ${item.friend.name} details`}
                      />

                      <div
                        className="relative h-12 w-12 rounded-[15px] flex items-center justify-center text-white text-base font-semibold shrink-0"
                        style={{ backgroundColor: getAvatarColor(item.friend.name) }}
                      >
                        {getInitials(item.friend.name)}
                        <span className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-dark-bg-secondary ${statusColor}`}></span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-neutral-900 dark:text-dark-text truncate">
                          {item.friend.name}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-dark-text-secondary truncate">
                          {item.friend.email}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-[11px] text-neutral-500 dark:text-dark-text-secondary">
                          {isYouOwe ? "you owe" : "owes you"}
                        </p>
                        <p className={`text-[15px] font-semibold font-display ${amountColor}`}>
                          {formatINR(item.balance)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void removeFriend(item.id);
                        }}
                        disabled={removingId === item.id}
                        className="relative z-10 p-1.5 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-50/10 transition-colors"
                        title="Remove friend"
                      >
                        {removingId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {settledFriends.length > 0 && !showSettled && (
              <button
                type="button"
                onClick={() => setShowSettled(true)}
                className="mt-4 w-full rounded-xl border border-dashed border-neutral-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary px-4 py-3 text-sm font-medium text-neutral-600 dark:text-dark-text-secondary hover:border-primary hover:text-primary transition-colors"
              >
                Show {settledFriends.length} settled friend{settledFriends.length === 1 ? "" : "s"}
              </button>
            )}
          </CardContent>
        </Card>

        {showSettled && settledFriends.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Previously Settled ({settledFriends.length})</CardTitle>
                <button
                  type="button"
                  onClick={() => setShowSettled(false)}
                  className="text-sm text-neutral-500 hover:text-primary transition-colors"
                >
                  Re-hide
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {settledFriends.map((item) => (
                  <div
                    key={`settled-${item.id}`}
                    onClick={() => router.push(`/friends/${item.friend.id}`)}
                    className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white/80 dark:bg-dark-bg-secondary/80 dark:border-dark-border px-4 py-3 opacity-70 cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="h-10 w-10 rounded-[13px] flex items-center justify-center text-white text-sm font-semibold shrink-0"
                        style={{ backgroundColor: getAvatarColor(item.friend.name) }}
                      >
                        {getInitials(item.friend.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900 dark:text-dark-text truncate">
                          {item.friend.name}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-dark-text-secondary truncate">
                          {item.friend.email}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-md bg-green-100 dark:bg-green-900/20 px-2.5 py-1 text-xs font-semibold text-green-700 dark:text-green-400">
                      ✓ Settled
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Floating Add Expense — hidden on mobile (FAB handles it), visible on desktop */}
        <Link
          href="/expenses/add"
          className="hidden md:flex fixed bottom-8 right-8 z-40 group items-center gap-2 rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-primary shadow-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl"
        >
          <Receipt className="h-4 w-4" />
          Add Expense
        </Link>

        <Modal isOpen={showSettleAllConfirm} onClose={() => setShowSettleAllConfirm(false)} title="Settle All Balances">
          <div className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">
              This will create settlement entries for all outstanding friend balances.
            </p>
            <div className="rounded-lg bg-neutral-50 dark:bg-dark-bg-tertiary p-3 text-sm">
              <p className="font-medium text-neutral-900 dark:text-dark-text">
                Outstanding friends: {activeBase.length}
              </p>
              <p className="text-neutral-500 dark:text-dark-text-secondary mt-1">
                Net position after settle: {formatINR(0)}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowSettleAllConfirm(false)} disabled={settlingAll}>
                Cancel
              </Button>
              <Button onClick={() => void handleSettleAll()} disabled={settlingAll || activeBase.length === 0}>
                {settlingAll ? "Settling..." : "Confirm Settle All"}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={showAddModal} onClose={resetModal} title="Add Friend" size="md">
          <div className="space-y-4">
            <div className="flex border-b border-neutral-200 dark:border-dark-border">
              {[
                { key: "search" as const, label: "Search", icon: Search },
                { key: "dummy" as const, label: "Demo Friend", icon: UserRoundPlus },
                { key: "invite" as const, label: "Invite", icon: Mail },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setModalTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      modalTab === tab.key
                        ? "border-primary text-primary"
                        : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-dark-text-secondary"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {modalTab === "search" && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void searchUsers()}
                  />
                  <Button onClick={() => void searchUsers()} disabled={searching}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>

                {searching && (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto"></div>
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div className="space-y-2">
                    {searchResults.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 dark:bg-dark-bg-secondary"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold shrink-0"
                            style={{ backgroundColor: getAvatarColor(user.name) }}
                          >
                            {getInitials(user.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-neutral-900 dark:text-dark-text truncate">
                              {user.name}
                            </p>
                            <p className="text-sm text-neutral-500 truncate">{user.email}</p>
                          </div>
                        </div>
                        {user.friendshipStatus === "none" && (
                          <Button onClick={() => void sendFriendRequest(user.id)} variant="primary">
                            <UserPlus className="h-4 w-4 mr-2" />
                            Add
                          </Button>
                        )}
                        {user.friendshipStatus === "pending" && (
                          <span className="text-sm text-neutral-500">Pending</span>
                        )}
                        {user.friendshipStatus === "accepted" && (
                          <span className="text-sm text-success">Friends</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!searching && hasSearched && searchResults.length === 0 && (
                  <div className="text-center py-6 text-neutral-500">
                    <UserPlus className="h-10 w-10 mx-auto mb-2 text-neutral-300" />
                    <p className="font-medium">No users found</p>
                    <p className="text-sm text-neutral-400 mt-1">
                      Try the <b>Invite</b> tab to invite via email, or <b>Demo Friend</b> to add a placeholder.
                    </p>
                  </div>
                )}

                {!hasSearched && !searching && (
                  <p className="text-sm text-neutral-400 text-center py-4">
                    Search for existing DooSplit users by name or email
                  </p>
                )}

                {!searching && searchQuery.trim().length > 0 && isEmailQuery(searchQuery) && searchResults.length === 0 && (
                  <div className="text-xs text-neutral-500 text-center">
                    Could not find a user. Use <b>Invite</b> to send an invitation.
                  </div>
                )}
              </div>
            )}

            {modalTab === "dummy" && (
              <div className="space-y-4">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-400">
                  <p className="font-medium mb-1">What is a Demo Friend?</p>
                  <p className="text-amber-600 dark:text-amber-500">
                    Add someone by name as a placeholder. You can track expenses with them now.
                    When they join DooSplit later via your invite, the demo account can be migrated.
                  </p>
                </div>

                <Input
                  label="Friend's Name"
                  type="text"
                  placeholder="e.g. Rahul, Priya..."
                  value={dummyName}
                  onChange={(e) => setDummyName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void createDummyFriend()}
                />

                <Button
                  onClick={() => void createDummyFriend()}
                  variant="primary"
                  className="w-full"
                  isLoading={creatingDummy}
                >
                  <UserRoundPlus className="h-4 w-4 mr-2" />
                  Add Demo Friend
                </Button>

                {dummyResult && (
                  <div
                    className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                      dummyResult.type === "success"
                        ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                        : "bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                    }`}
                  >
                    {dummyResult.type === "success" ? (
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    )}
                    {dummyResult.message}
                  </div>
                )}
              </div>
            )}

            {modalTab === "invite" && (
              <div className="space-y-4">
                <div className="bg-neutral-50 dark:bg-dark-bg-tertiary rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-dark-text-secondary">
                    <Mail className="h-4 w-4 text-primary" />
                    Send Email Invitation
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="friend@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void sendInviteFromModal()}
                    />
                    <Button
                      onClick={() => void sendInviteFromModal()}
                      disabled={sendingInvite || !inviteEmail.trim()}
                      variant="primary"
                    >
                      {sendingInvite ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {inviteResult && (
                    <div
                      className={`p-3 rounded-lg text-sm ${
                        inviteResult.type === "success"
                          ? "bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
                          : "bg-red-50 border border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {inviteResult.type === "success" ? (
                          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        )}
                        <div>
                          <p>{inviteResult.message}</p>
                          {inviteResult.inviteLink && (
                            <button
                              onClick={() => void copyToClipboard(inviteResult.inviteLink!)}
                              className="mt-1 inline-flex items-center gap-1 text-primary text-xs hover:underline"
                            >
                              {copied ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              {copied ? "Copied!" : "Copy invite link"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-neutral-200 dark:border-dark-border"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 bg-white dark:bg-dark-bg-secondary text-neutral-400">or</span>
                  </div>
                </div>

                <Button
                  onClick={() => {
                    resetModal();
                    router.push("/invite");
                  }}
                  variant="secondary"
                  className="w-full"
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Full Invite Page (Link + WhatsApp)
                </Button>
              </div>
            )}
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
