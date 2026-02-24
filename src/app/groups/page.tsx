"use client";

import { useEffect, useState } from "react";
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
import { Users, Plus, Settings } from "lucide-react";

interface Group {
  _id: string;
  name: string;
  description: string;
  image: string | null;
  type: string;
  currency: string;
  memberCount: number;
  userRole: string;
  members: any[];
}

interface Friend {
  _id: string;
  name: string;
  email: string;
  balance: number;
}

export default function GroupsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { trackEvent } = useAnalytics();
  const [groups, setGroups] = useState<Group[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "trip",
    currency: "INR",
    memberIds: [] as string[],
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    } else if (status === "authenticated") {
      fetchGroups(true);
      fetchFriends();
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ domains?: string[] }>).detail;
      const domains = detail?.domains || [];
      if (
        domains.includes("groups") ||
        domains.includes("friends") ||
        domains.includes("expenses") ||
        domains.includes("activity")
      ) {
        fetchGroups(true);
        fetchFriends();
      }
    };

    window.addEventListener("doosplit:data-updated", handler as EventListener);
    return () => {
      window.removeEventListener("doosplit:data-updated", handler as EventListener);
    };
  }, [status]);

  const fetchGroups = async (forceFresh = false) => {
    try {
      const res = await fetch(`/api/groups${forceFresh ? `?refresh=${Date.now()}` : ""}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setGroups((data.groups || []) as Group[]);
        return;
      }

      const offlineStore = getOfflineStore();
      const groupsData = await offlineStore.getGroups();
      setGroups((groupsData || []) as unknown as Group[]);
    } catch (error) {
      console.error("Failed to fetch groups:", error);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFriends = async () => {
    try {
      const offlineStore = getOfflineStore();
      const rawFriends = await offlineStore.getFriends();
      const mappedFriends = (rawFriends || []).map((item: any) => ({
        _id: item.friend?.id || item.id || item._id,
        name: item.friend?.name || item.name || "Unknown",
        email: item.friend?.email || item.email || "",
        balance: item.balance || 0,
      }));
      setFriends(mappedFriends);
    } catch (error) {
      console.error("Failed to fetch friends:", error);
      setFriends([]);
    }
  };

  const createGroup = async () => {
    if (!formData.name) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.group?._id) {
          setGroups((prev) => {
            const next = prev.filter((item) => item._id !== data.group._id);
            return [data.group, ...next];
          });
        }
        trackEvent(AnalyticsEvents.GROUP_CREATED, {
          member_count: formData.memberIds.length,
          group_type: formData.type,
          currency: formData.currency
        });
        setShowCreateModal(false);
        setFormData({
          name: "",
          description: "",
          type: "trip",
          currency: "INR",
          memberIds: [],
        });
        fetchGroups(true);
      }
    } catch (error) {
      console.error("Failed to create group:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMemberSelection = (friendId: string) => {
    setFormData((prev) => ({
      ...prev,
      memberIds: prev.memberIds.includes(friendId)
        ? prev.memberIds.filter((id) => id !== friendId)
        : [...prev.memberIds, friendId],
    }));
  };

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
              Groups
            </h1>
            <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
              Manage group expenses with multiple people
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Group
          </Button>
        </div>

        {/* Groups Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.length === 0 ? (
            <Card className="col-span-full">
              <CardContent>
                <div className="text-center py-12">
                  <Users className="h-16 w-16 mx-auto text-neutral-300 mb-4" />
                  <p className="text-body text-neutral-500 dark:text-dark-text-secondary">
                    No groups yet
                  </p>
                  <p className="text-sm text-neutral-400 dark:text-dark-text-tertiary mt-2">
                    Create a group to organize expenses with multiple friends
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            groups.map((group) => (
              <Card
                key={group._id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => router.push(`/groups/${group._id}`)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{group.name}</CardTitle>
                    {group.userRole === "admin" && (
                      <Settings className="h-4 w-4 text-neutral-400" />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {group.description && (
                    <p className="text-sm text-neutral-500 mb-3">
                      {group.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-600 dark:text-dark-text-secondary">
                      {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                      {group.type}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Create Group Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setFormData({
              name: "",
              description: "",
              type: "trip",
              currency: "INR",
              memberIds: [],
            });
          }}
          title="Create New Group"
        >
          <div className="space-y-4">
            <Input
              label="Group Name"
              type="text"
              placeholder="e.g., Goa Trip"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
            />

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="What's this group for?"
                className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Type
              </label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, type: e.target.value }))
                }
                className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
              >
                <option value="trip">Trip</option>
                <option value="home">Home</option>
                <option value="couple">Couple</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Add Members
              </label>
              <div className="max-h-48 overflow-y-auto space-y-2 border border-neutral-200 dark:border-dark-border rounded-lg p-2">
                {friends.length === 0 ? (
                  <p className="text-sm text-neutral-500 text-center py-4">
                    No friends to add
                  </p>
                ) : (
                  friends.map((friend) => (
                    <label
                      key={friend._id}
                      className="flex items-center gap-3 p-2 hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formData.memberIds.includes(friend._id)}
                        onChange={() => toggleMemberSelection(friend._id)}
                        className="rounded border-neutral-300"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{friend.name}</p>
                        <p className="text-xs text-neutral-500">{friend.email}</p>
                      </div>
                      {friend.balance !== 0 && (
                        <div className="text-right">
                          <span className={`text-xs font-medium ${
                            friend.balance > 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {friend.balance > 0 ? '+' : ''}₹{Math.abs(friend.balance)}
                          </span>
                          <p className="text-xs text-neutral-500">
                            {friend.balance > 0 ? 'Owes you' : 'You owe'}
                          </p>
                        </div>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button
                variant="secondary"
                onClick={() => setShowCreateModal(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={createGroup}
                disabled={!formData.name || submitting}
              >
                {submitting ? "Creating..." : "Create Group"}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}

