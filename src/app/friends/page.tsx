"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { UserPlus, Search, Users, Check, X } from "lucide-react";
import Modal from "@/components/ui/Modal";

interface Friend {
  _id: string;
  name: string;
  email: string;
  profilePicture?: string;
  balance: number;
}

interface FriendRequest {
  _id: string;
  userId: {
    _id: string;
    name: string;
    email: string;
    profilePicture?: string;
  };
  status: string;
  createdAt: string;
}

interface SearchUser {
  _id: string;
  name: string;
  email: string;
  profilePicture?: string;
  friendshipStatus: string;
}

export default function FriendsPage() {
  const { data: session } = useSession();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (session) {
      fetchFriends();
      fetchRequests();
    }
  }, [session]);

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

  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
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
        body: JSON.stringify({ friendId }),
      });

      if (res.ok) {
        // Update search results
        setSearchResults((prev) =>
          prev.map((user) =>
            user._id === friendId
              ? { ...user, friendshipStatus: "pending" }
              : user
          )
        );
      }
    } catch (error) {
      console.error("Failed to send friend request:", error);
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  if (loading) {
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
              <CardTitle>Friend Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {requests.map((request) => (
                  <div
                    key={request._id}
                    className="flex items-center justify-between py-2 border-b border-neutral-200 dark:border-dark-border last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-primary font-semibold">
                          {request.userId.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-dark-text">
                          {request.userId.name}
                        </p>
                        <p className="text-sm text-neutral-500">
                          {request.userId.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleRequest(request._id, "accept")}
                        variant="primary"
                        className="!px-3 !py-1"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleRequest(request._id, "reject")}
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

        {/* Friends List */}
        <Card>
          <CardHeader>
            <CardTitle>All Friends ({friends.length})</CardTitle>
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
              </div>
            ) : (
              <div className="space-y-3">
                {friends.map((friend) => (
                  <div
                    key={friend._id}
                    className="flex items-center justify-between py-2 border-b border-neutral-200 dark:border-dark-border last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-primary font-semibold">
                          {friend.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-dark-text">
                          {friend.name}
                        </p>
                        <p className="text-sm text-neutral-500">{friend.email}</p>
                      </div>
                    </div>
                    <div
                      className={`text-lg font-semibold ${
                        friend.balance === 0
                          ? "text-neutral-500"
                          : friend.balance > 0
                          ? "text-success"
                          : "text-coral"
                      }`}
                    >
                      {friend.balance === 0
                        ? "Settled up"
                        : (friend.balance > 0 ? "+" : "") +
                          formatCurrency(friend.balance)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Friend Modal */}
        <Modal
          isOpen={showAddModal}
          onClose={() => {
            setShowAddModal(false);
            setSearchQuery("");
            setSearchResults([]);
          }}
          title="Add Friend"
        >
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
                    key={user._id}
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
                        onClick={() => sendFriendRequest(user._id)}
                        variant="primary"
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add
                      </Button>
                    )}
                    {user.friendshipStatus === "pending" && (
                      <span className="text-sm text-neutral-500">Pending</span>
                    )}
                    {user.friendshipStatus === "friends" && (
                      <span className="text-sm text-success">Friends</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!searching &&
              searchQuery &&
              searchResults.length === 0 && (
                <div className="text-center py-8 text-neutral-500">
                  <p>No users found</p>
                </div>
              )}
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
