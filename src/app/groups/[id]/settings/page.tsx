"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/auth/react-session";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import getOfflineStore from "@/lib/offline-store";
import {
  ArrowLeft,
  Pencil,
  UserPlus,
  Copy,
  Check,
  Wand2,
  LogOut,
  Trash2,
  Users,
} from "lucide-react";

interface GroupMember {
  _id: string;
  userId: {
    _id: string;
    name: string;
    email: string;
  } | null;
  role: string;
}

interface GroupBalance {
  userId: string;
  userName: string;
  balance: number;
}

interface Group {
  _id: string;
  name: string;
  description?: string;
  type: string;
  currency: string;
  members: GroupMember[];
  balances?: GroupBalance[];
  memberCount: number;
  userRole: string;
}

interface FriendOption {
  _id: string;
  name: string;
  email: string;
}

interface SimplifiedDebtTransaction {
  from: {
    id: string;
    name: string;
  };
  to: {
    id: string;
    name: string;
  };
  amount: number;
}

interface SimplifiedDebtsPayload {
  transactions: SimplifiedDebtTransaction[];
  originalCount: number;
  optimizedCount: number;
  savings: number;
  message?: string;
}

function groupTypeEmoji(type: string): string {
  if (type === "trip") return "✈️";
  if (type === "home") return "🏠";
  if (type === "couple") return "💑";
  return "👥";
}

function groupTypeColor(type: string): string {
  if (type === "trip") return "bg-primary/15";
  if (type === "home") return "bg-info/15";
  if (type === "couple") return "bg-coral/15";
  return "bg-neutral-200 dark:bg-dark-bg-tertiary";
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatCurrency(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function GroupSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const groupId = String(params.id || "");

  const [group, setGroup] = useState<Group | null>(null);
  const [friends, setFriends] = useState<FriendOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null);

  const [inviteCopied, setInviteCopied] = useState(false);

  const [showSimplifiedModal, setShowSimplifiedModal] = useState(false);
  const [simplifiedDebts, setSimplifiedDebts] = useState<SimplifiedDebtsPayload | null>(null);
  const [loadingSimplifiedDebts, setLoadingSimplifiedDebts] = useState(false);

  const [processingLeave, setProcessingLeave] = useState(false);
  const [processingDelete, setProcessingDelete] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsReady(true), 20);
    return () => window.clearTimeout(timer);
  }, []);

  const fetchGroup = async () => {
    const response = await fetch(`/api/groups/${groupId}`, { cache: "no-store" });
    if (!response.ok) {
      if (response.status === 404) {
        router.push("/groups");
        return null;
      }
      throw new Error("Failed to fetch group settings");
    }

    const data = (await response.json()) as { group: Group };
    const nextGroup = data.group || null;
    setGroup(nextGroup);
    setDraftName(nextGroup?.name || "");
    return nextGroup;
  };

  const fetchFriends = async () => {
    try {
      const offlineStore = getOfflineStore();
      const rawFriends = await offlineStore.getFriends();
      const mapped = (rawFriends || []).map((item: unknown) => {
        const row = item as {
          id?: string;
          _id?: string;
          name?: string;
          email?: string;
          friend?: { id?: string; name?: string; email?: string };
        };

        return {
          _id: row.friend?.id || row.id || row._id || "",
          name: row.friend?.name || row.name || "Unknown",
          email: row.friend?.email || row.email || "",
        };
      });

      setFriends(mapped.filter((friend) => Boolean(friend._id)));
    } catch (error) {
      console.error("Failed to fetch friends for group settings:", error);
      setFriends([]);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }

    if (status !== "authenticated" || !groupId) {
      return;
    }

    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchGroup(), fetchFriends()]);
      } catch (error) {
        console.error("Failed to load group settings:", error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [groupId, router, status]);

  const memberBalances = useMemo(() => {
    const map = new Map<string, number>();
    for (const balance of group?.balances || []) {
      map.set(String(balance.userId), toNumber(balance.balance));
    }
    return map;
  }, [group?.balances]);

  const availableFriends = useMemo(() => {
    const memberIds = new Set(
      (group?.members || [])
        .map((member) => String(member.userId?._id || ""))
        .filter(Boolean)
    );

    return friends.filter((friend) => !memberIds.has(friend._id));
  }, [friends, group?.members]);

  const isAdmin = group?.userRole === "admin";

  const saveGroupName = async () => {
    const trimmed = draftName.trim();
    if (!trimmed || !group || trimmed === group.name) {
      setEditingName(false);
      return;
    }

    setSavingName(true);
    try {
      const response = await fetch(`/api/groups/${groupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || "Failed to update group name");
      }

      const data = (await response.json()) as { group: Group };
      setGroup(data.group);
      setDraftName(data.group?.name || trimmed);
      setEditingName(false);
    } catch (error) {
      console.error("Failed to save group name:", error);
      alert(error instanceof Error ? error.message : "Unable to save group name.");
    } finally {
      setSavingName(false);
    }
  };

  const addMember = async (userId: string) => {
    if (!userId) {
      return;
    }

    setAddingMemberId(userId);
    try {
      const response = await fetch(`/api/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || "Failed to add member");
      }

      await fetchGroup();
      setShowAddMembersModal(false);
    } catch (error) {
      console.error("Failed to add member:", error);
      alert(error instanceof Error ? error.message : "Unable to add member.");
    } finally {
      setAddingMemberId(null);
    }
  };

  const handleCopyInviteLink = async () => {
    try {
      const inviteUrl = `${window.location.origin}/invite?groupId=${groupId}`;
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy invite link:", error);
      alert("Unable to copy invite link.");
    }
  };

  const openSimplifiedDebts = async () => {
    setShowSimplifiedModal(true);
    setLoadingSimplifiedDebts(true);

    try {
      const response = await fetch(`/api/groups/${groupId}/simplified-debts`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || "Failed to fetch simplified debts");
      }

      const data = (await response.json()) as SimplifiedDebtsPayload;
      setSimplifiedDebts(data);
    } catch (error) {
      console.error("Failed to fetch simplified debts:", error);
      setSimplifiedDebts(null);
      alert(error instanceof Error ? error.message : "Unable to load simplified debts.");
    } finally {
      setLoadingSimplifiedDebts(false);
    }
  };

  const leaveGroup = async () => {
    if (!session?.user?.id) {
      return;
    }

    const confirmed = window.confirm("Leave this group? You can be re-added by an admin later.");
    if (!confirmed) {
      return;
    }

    setProcessingLeave(true);
    try {
      const response = await fetch(`/api/groups/${groupId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.user.id }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || "Failed to leave group");
      }

      router.push("/groups");
    } catch (error) {
      console.error("Failed to leave group:", error);
      alert(error instanceof Error ? error.message : "Unable to leave group.");
    } finally {
      setProcessingLeave(false);
    }
  };

  const deleteGroup = async () => {
    const confirmed = window.confirm(
      "Delete this group permanently? This cannot be undone and requires no remaining expenses."
    );
    if (!confirmed) {
      return;
    }

    setProcessingDelete(true);
    try {
      const response = await fetch(`/api/groups/${groupId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || "Failed to delete group");
      }

      router.push("/groups");
    } catch (error) {
      console.error("Failed to delete group:", error);
      alert(error instanceof Error ? error.message : "Unable to delete group.");
    } finally {
      setProcessingDelete(false);
    }
  };

  if (loading || status === "loading" || !group) {
    return (
      <AppShell>
        <div className="flex min-h-[420px] items-center justify-center">
          <LoadingSpinner />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div
        className={`mx-auto max-w-3xl space-y-4 p-4 md:p-6 transition-all duration-300 ${
          isReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={() => router.push(`/groups/${groupId}`)}
            className="rounded-lg p-2 transition-colors hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
            aria-label="Back to group"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="flex-1 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-dark-border dark:bg-dark-bg-secondary">
            <div className="flex items-center gap-3">
              <div
                className={`h-12 w-12 rounded-xl text-2xl flex items-center justify-center ${groupTypeColor(
                  group.type
                )}`}
              >
                {groupTypeEmoji(group.type)}
              </div>

              <div className="min-w-0 flex-1">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      className="h-10"
                    />
                    <Button
                      size="sm"
                      onClick={saveGroupName}
                      disabled={savingName || !draftName.trim() || draftName.trim() === group.name}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setDraftName(group.name);
                        setEditingName(false);
                      }}
                      disabled={savingName}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <h1 className="truncate text-h2 font-display font-bold text-neutral-900 dark:text-dark-text">
                      {group.name}
                    </h1>
                    <p className="text-xs text-neutral-500 dark:text-dark-text-secondary">
                      Manage members, invites, and debt settings
                    </p>
                    {group.description && (
                      <p className="truncate text-sm text-neutral-500 dark:text-dark-text-secondary">
                        {group.description}
                      </p>
                    )}
                  </>
                )}
              </div>

              {!editingName && (
                <button
                  className="rounded-lg p-2 transition-colors hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
                  onClick={() => setEditingName(true)}
                  aria-label="Edit group name"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <Card className="transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Group Members</CardTitle>
          </CardHeader>
          <CardContent>
            {(group.members || []).length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                No members found.
              </p>
            ) : (
              <div className="divide-y divide-neutral-200 dark:divide-dark-border">
                {group.members.map((member) => {
                  const userId = String(member.userId?._id || "");
                  const memberBalance = memberBalances.get(userId) || 0;
                  const isCurrentUser = userId === String(session?.user?.id || "");
                  const initial = (member.userId?.name || "U").charAt(0).toUpperCase();

                  return (
                    <div key={member._id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                          {initial}
                        </div>
                        <div>
                          <p className="font-medium text-neutral-900 dark:text-dark-text">
                            {member.userId?.name || "Unknown"}
                            {isCurrentUser ? " (you)" : ""}
                          </p>
                          <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                            {member.userId?.email || ""}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p
                          className={`text-sm font-semibold ${
                            memberBalance > 0
                              ? "text-primary"
                              : memberBalance < 0
                              ? "text-coral"
                              : "text-neutral-500 dark:text-dark-text-secondary"
                          }`}
                        >
                          {memberBalance > 0
                            ? "gets back"
                            : memberBalance < 0
                            ? "owes"
                            : "settled"}
                        </p>
                        {Math.abs(memberBalance) > 0.01 && (
                          <p className="text-sm font-mono text-neutral-700 dark:text-dark-text-secondary">
                            {formatCurrency(Math.abs(memberBalance), group.currency)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => setShowAddMembersModal(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add people to group
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Invite via Link</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-neutral-500 dark:text-dark-text-secondary">
              Share an invite link so people can join quickly.
            </p>
            <Button variant="secondary" onClick={handleCopyInviteLink}>
              {inviteCopied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy invite link
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Advanced Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-neutral-500 dark:text-dark-text-secondary">
              Review optimized payments to simplify who should pay whom.
            </p>
            <Button variant="secondary" onClick={openSimplifiedDebts}>
              <Wand2 className="mr-2 h-4 w-4" />
              Simplify group debts
            </Button>
          </CardContent>
        </Card>

        <Card className="border-coral/30 transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Danger Zone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-neutral-500 dark:text-dark-text-secondary">
              These actions affect your access and cannot always be undone.
            </p>
            <Button variant="outline" onClick={leaveGroup} disabled={processingLeave}>
              <LogOut className="mr-2 h-4 w-4" />
              {processingLeave ? "Leaving..." : "Leave group"}
            </Button>

            {isAdmin && (
              <Button variant="destructive" onClick={deleteGroup} disabled={processingDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                {processingDelete ? "Deleting..." : "Delete group"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal
        isOpen={showAddMembersModal}
        onClose={() => setShowAddMembersModal(false)}
        title="Add People"
      >
        <div className="space-y-3">
          {availableFriends.length === 0 ? (
            <div className="rounded-lg border border-neutral-200 p-4 text-sm text-neutral-500 dark:border-dark-border dark:text-dark-text-secondary">
              <div className="mb-2 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Everyone is already in this group.
              </div>
            </div>
          ) : (
            availableFriends.map((friend) => (
              <div
                key={friend._id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 p-3 dark:border-dark-border"
              >
                <div>
                  <p className="font-medium text-neutral-900 dark:text-dark-text">{friend.name}</p>
                  <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">{friend.email}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => addMember(friend._id)}
                  disabled={addingMemberId === friend._id}
                >
                  {addingMemberId === friend._id ? "Adding..." : "Add"}
                </Button>
              </div>
            ))
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showSimplifiedModal}
        onClose={() => setShowSimplifiedModal(false)}
        title="Simplified Debts"
      >
        {loadingSimplifiedDebts ? (
          <div className="py-8">
            <LoadingSpinner />
          </div>
        ) : simplifiedDebts?.transactions?.length ? (
          <div className="space-y-3">
            {simplifiedDebts.transactions.map((tx) => (
              <div
                key={`${tx.from.id}-${tx.to.id}-${tx.amount}`}
                className="rounded-lg border border-neutral-200 p-3 dark:border-dark-border"
              >
                <p className="text-sm text-neutral-700 dark:text-dark-text-secondary">
                  <span className="font-semibold text-neutral-900 dark:text-dark-text">{tx.from.name}</span> pays{" "}
                  <span className="font-semibold text-neutral-900 dark:text-dark-text">{tx.to.name}</span>
                </p>
                <p className="mt-1 font-mono text-primary">
                  {formatCurrency(tx.amount, group.currency)}
                </p>
              </div>
            ))}
            {simplifiedDebts.message && (
              <p className="text-xs text-neutral-500 dark:text-dark-text-secondary">
                {simplifiedDebts.message}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
            Already optimized. No extra transactions needed.
          </p>
        )}
      </Modal>
    </AppShell>
  );
}
