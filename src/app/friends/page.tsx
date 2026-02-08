"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import {
  UserPlus, Search, Users, Check, X, Mail, Send, Link2,
  Copy, CheckCircle2, AlertCircle, Trash2, UserRoundPlus,
  Clock, Loader2,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import getOfflineStore from "@/lib/offline-store";

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

export default function FriendsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'outstanding' | 'owe' | 'owed'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

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
  const [inviteResult, setInviteResult] = useState<{
    type: "success" | "error";
    message: string;
    inviteLink?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Tab in modal
  const [modalTab, setModalTab] = useState<"search" | "dummy" | "invite">("search");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    } else if (status === "authenticated") {
      fetchFriends();
      fetchRequests();
      fetchInvitations();
    }
  }, [status]);

  const fetchFriends = async () => {
    try {
      const res = await fetch("/api/friends");
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
      }
    } catch (error) {
      console.error("Failed to fetch friends:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      const res = await fetch("/api/friends/requests");
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
      const res = await fetch("/api/invitations");
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations || []);
      }
    } catch {
      // silent
    }
  };

  // Filter friends based on balance
  const filteredFriends = friends.filter(friend => {
    switch (balanceFilter) {
      case 'outstanding':
        return friend.balance !== 0;
      case 'owe':
        return friend.balance < 0;
      case 'owed':
        return friend.balance > 0;
      default:
        return true;
    }
  });

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
        `/api/friends/search?query=${encodeURIComponent(searchQuery)}`
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
        setDummyResult({ type: "success", message: `"${dummyName.trim()}" added as a placeholder friend!` });
        setDummyName("");
        fetchFriends();
      } else {
        setDummyResult({ type: "error", message: data.error || "Failed to create dummy friend" });
      }
    } catch {
      setDummyResult({ type: "error", message: "Something went wrong" });
    } finally {
      setCreatingDummy(false);
    }
  };

  const sendInviteFromModal = async (emailToInvite?: string) => {
    const targetEmail = emailToInvite || inviteEmail;
    if (!targetEmail.trim()) return;

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

      setInviteResult({
        type: "success",
        message: data.emailSent
          ? `Invitation sent to ${targetEmail}!`
          : `Invitation created! Share the link manually.`,
        inviteLink: data.invitation?.inviteLink,
      });
      setInviteEmail("");
      fetchInvitations();
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

  const handleRequest = async (requestId: string, action: "accept" | "reject") => {
    try {
      const res = await fetch(`/api/friends/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (res.ok) {
        fetchFriends();
        fetchRequests();
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

  const isEmailQuery = (q: string) => /^\S+@\S+\.\S+$/.test(q.trim());

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
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
      <div className="p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
              Friends
            </h1>
            <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
              Manage your friends and balances
            </p>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Friend
          </Button>
        </div>

        {/* Friend Requests */}
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
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-primary font-semibold">
                          {request.from.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-dark-text">
                          {request.from.name}
                        </p>
                        <p className="text-sm text-neutral-500">
                          {request.from.email}
                        </p>
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

        {/* Pending Invitations */}
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
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <Mail className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-dark-text">
                          {inv.email}
                        </p>
                        <p className="text-xs text-neutral-400">
                          Invited {new Date(inv.createdAt).toLocaleDateString("en-US", {
                            month: "short", day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      <Clock className="h-3 w-3" />
                      Pending
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Friends List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>All Friends ({filteredFriends.length})</CardTitle>
              <div className="flex gap-1 bg-neutral-100 dark:bg-dark-bg-secondary rounded-lg p-1">
                <button
                  onClick={() => setBalanceFilter('all')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    balanceFilter === 'all'
                      ? 'bg-white dark:bg-dark-bg text-primary shadow-sm'
                      : 'text-neutral-600 dark:text-dark-text-secondary hover:text-neutral-900 dark:hover:text-dark-text'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setBalanceFilter('outstanding')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    balanceFilter === 'outstanding'
                      ? 'bg-white dark:bg-dark-bg text-primary shadow-sm'
                      : 'text-neutral-600 dark:text-dark-text-secondary hover:text-neutral-900 dark:hover:text-dark-text'
                  }`}
                >
                  Outstanding
                </button>
                <button
                  onClick={() => setBalanceFilter('owe')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    balanceFilter === 'owe'
                      ? 'bg-white dark:bg-dark-bg text-primary shadow-sm'
                      : 'text-neutral-600 dark:text-dark-text-secondary hover:text-neutral-900 dark:hover:text-dark-text'
                  }`}
                >
                  I Owe
                </button>
                <button
                  onClick={() => setBalanceFilter('owed')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    balanceFilter === 'owed'
                      ? 'bg-white dark:bg-dark-bg text-primary shadow-sm'
                      : 'text-neutral-600 dark:text-dark-text-secondary hover:text-neutral-900 dark:hover:text-dark-text'
                  }`}
                >
                  Owed
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {friends.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto mb-3 text-neutral-300" />
                <p className="text-body text-neutral-500 dark:text-dark-text-secondary">
                  No friends yet
                </p>
                <p className="text-sm text-neutral-400 dark:text-dark-text-tertiary mt-2">
                  Start by adding friends to track expenses together
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center mt-4">
                  <Button onClick={() => { setModalTab("search"); setShowAddModal(true); }} variant="primary">
                    <Search className="h-4 w-4 mr-2" />
                    Search &amp; Add
                  </Button>
                  <Button onClick={() => { setModalTab("dummy"); setShowAddModal(true); }} variant="secondary">
                    <UserRoundPlus className="h-4 w-4 mr-2" />
                    Add Demo Friend
                  </Button>
                  <Button onClick={() => { setModalTab("invite"); setShowAddModal(true); }} variant="secondary">
                    <Mail className="h-4 w-4 mr-2" />
                    Invite
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredFriends.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => router.push(`/friends/${item.friend.id}`)}
                    className="flex items-center justify-between py-3 px-2 rounded-lg border border-neutral-200 dark:border-dark-border hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        item.friend.isDummy
                          ? "bg-amber-100 dark:bg-amber-900/30"
                          : "bg-primary/20"
                      }`}>
                        <span className={`font-semibold ${
                          item.friend.isDummy ? "text-amber-600" : "text-primary"
                        }`}>
                          {item.friend.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-neutral-900 dark:text-dark-text flex items-center gap-2">
                          {item.friend.name}
                          {item.friend.isDummy && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-normal">
                              Demo
                            </span>
                          )}
                        </p>
                        {!item.friend.isDummy && (
                          <p className="text-sm text-neutral-500">{item.friend.email}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold ${
                        item.balance === 0
                          ? "text-neutral-500"
                          : item.balance > 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}>
                        {item.balance === 0
                          ? "Settled up"
                          : `₹${Math.abs(item.balance).toLocaleString("en-IN")}`}
                      </div>
                      <div className={`text-xs ${
                        item.balance === 0
                          ? "text-neutral-400"
                          : item.balance > 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}>
                        {item.balance === 0
                          ? "No balance"
                          : item.balance > 0
                          ? "Owes you"
                          : "You owe"}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFriend(item.id);
                      }}
                      disabled={removingId === item.id}
                      className="p-1.5 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-50/10 transition-colors ml-2"
                      title="Remove friend"
                    >
                      {removingId === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Friend Modal */}
        <Modal
          isOpen={showAddModal}
          onClose={resetModal}
          title="Add Friend"
          size="md"
        >
          <div className="space-y-4">
            {/* Tabs */}
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

            {/* Search Tab */}
            {modalTab === "search" && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchUsers()}
                  />
                  <Button onClick={searchUsers} disabled={searching}>
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
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-primary font-semibold">
                              {user.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-neutral-900 dark:text-dark-text">
                              {user.name}
                            </p>
                            <p className="text-sm text-neutral-500">{user.email}</p>
                          </div>
                        </div>
                        {user.friendshipStatus === "none" && (
                          <Button
                            onClick={() => sendFriendRequest(user.id)}
                            variant="primary"
                          >
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
              </div>
            )}

            {/* Dummy/Demo Friend Tab */}
            {modalTab === "dummy" && (
              <div className="space-y-4">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-400">
                  <p className="font-medium mb-1">What is a Demo Friend?</p>
                  <p className="text-amber-600 dark:text-amber-500">
                    Add someone by name as a placeholder. You can track expenses with them now.
                    When they join DooSplit later via your invite, the demo account merges into their real account automatically.
                  </p>
                </div>

                <Input
                  label="Friend's Name"
                  type="text"
                  placeholder="e.g. Rahul, Priya..."
                  value={dummyName}
                  onChange={(e) => setDummyName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createDummyFriend()}
                />

                <Button
                  onClick={createDummyFriend}
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

            {/* Invite Tab */}
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
                      onKeyDown={(e) => e.key === "Enter" && sendInviteFromModal()}
                    />
                    <Button
                      onClick={() => sendInviteFromModal()}
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
                              onClick={() => copyToClipboard(inviteResult.inviteLink!)}
                              className="mt-1 inline-flex items-center gap-1 text-primary text-xs hover:underline"
                            >
                              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
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
                  onClick={() => { resetModal(); router.push("/invite"); }}
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
