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
  FileText,
  Share2,
  Loader2,
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
  notes?: string;
  settleUpDate?: string;
  simplifyDebts?: boolean;
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

function getAvatarColor(name: string): string {
  const colors = [
    "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300",
    "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300",
    "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    "bg-teal-100 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300",
    "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300",
    "bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300",
    "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/30 dark:text-fuchsia-300",
    "bg-pink-100 text-pink-700 dark:bg-pink-950/30 dark:text-pink-300",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
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
  const [editingType, setEditingType] = useState(false);
  const [draftType, setDraftType] = useState("");
  const [savingType, setSavingType] = useState(false);

  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null);

  const [inviteCopied, setInviteCopied] = useState(false);

  const [showSimplifiedModal, setShowSimplifiedModal] = useState(false);
  const [simplifiedDebts, setSimplifiedDebts] = useState<SimplifiedDebtsPayload | null>(null);
  const [loadingSimplifiedDebts, setLoadingSimplifiedDebts] = useState(false);

  const [processingLeave, setProcessingLeave] = useState(false);
  const [processingDelete, setProcessingDelete] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);

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
    setDraftType(nextGroup?.type || "trip");
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

  const saveGroupType = async () => {
    if (!group || draftType === group.type) {
      setEditingType(false);
      return;
    }

    setSavingType(true);
    try {
      const response = await fetch(`/api/groups/${groupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: draftType }),
      });

      if (!response.ok) {
        throw new Error("Failed to update group type");
      }

      const data = await response.json();
      setGroup(data.group);
      setEditingType(false);
    } catch (error) {
      console.error("Failed to save group type:", error);
      alert("Unable to save group type.");
    } finally {
      setSavingType(false);
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

    const myId = String(session.user.id);
    const myBalance = memberBalances.get(myId) || 0;
    if (Math.abs(myBalance) > 0.01) {
      alert(`You cannot leave the group because you have a non-zero balance of ${formatCurrency(myBalance, group?.currency)}. Please settle your balances first.`);
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

  const generateGroupPdf = async () => {
    if (!group) return;
    setExportingReport(true);
    try {
      // Fetch all expenses for this group (up to 200)
      const expRes = await fetch(`/api/expenses?groupId=${groupId}&limit=200&page=1`, {
        cache: "no-store",
      });
      const expData = expRes.ok ? await expRes.json() : { expenses: [] };
      const rawExpenses = Array.isArray(expData.expenses) ? expData.expenses : [];

      // Fetch simplified debts
      let simplifiedTransactions: { fromName: string; toName: string; amount: number }[] = [];
      try {
        const sdRes = await fetch(`/api/groups/${groupId}/simplified-debts`, { cache: "no-store" });
        if (sdRes.ok) {
          const sdData = await sdRes.json();
          simplifiedTransactions = (sdData.transactions || []).map((tx: {
            from: { name: string };
            to: { name: string };
            amount: number;
          }) => ({
            fromName: tx.from.name,
            toName: tx.to.name,
            amount: tx.amount,
          }));
        }
      } catch {
        // non-critical
      }

      const { generateGroupReport } = await import("@/lib/reportGenerator");
      await generateGroupReport({
        groupName: group.name,
        groupType: group.type,
        currency: group.currency,
        generatedAt: new Date().toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
        members: (group.balances || []).map((b) => ({
          name: b.userName,
          balance: toNumber(b.balance),
        })),
        expenses: rawExpenses.map((e: {
          date?: string;
          description?: string;
          category?: string;
          amount?: number;
          currency?: string;
          createdBy?: { name?: string } | null;
          splitMethod?: string;
        }) => ({
          date: e.date || new Date().toISOString(),
          description: e.description || "",
          category: e.category || "other",
          amount: toNumber(e.amount),
          currency: e.currency || group.currency,
          paidByName: e.createdBy?.name || "Unknown",
          splitMethod: e.splitMethod || "equally",
        })),
        simplifiedTransactions,
        totalSpent: rawExpenses.reduce((sum: number, e: { amount?: number }) => sum + toNumber(e.amount), 0),
      });
    } catch (error) {
      console.error("Failed to generate report:", error);
      alert("Failed to generate report. Please try again.");
    } finally {
      setExportingReport(false);
    }
  };

  const handleShareReport = async () => {
    // Attempt Web Share API first (mobile)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `${group?.name} — DooSplit Expense Report`,
          text: `Here's the expense report for ${group?.name} from DooSplit. Total: ${formatCurrency(group?.balances?.reduce((sum, b) => sum + (b.balance > 0 ? b.balance : 0), 0) || 0, group?.currency || "INR")}`,
          url: window.location.origin + `/groups/${groupId}`,
        });
        return;
      } catch {
        // user cancelled or not supported — fall through
      }
    }
    // Fallback: generate PDF
    await generateGroupPdf();
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
                    {editingType ? (
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          value={draftType}
                          onChange={(e) => setDraftType(e.target.value)}
                          className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text text-sm focus:outline-none"
                        >
                          <option value="trip">Trip ✈️</option>
                          <option value="home">Home 🏠</option>
                          <option value="couple">Couple 💑</option>
                          <option value="other">Other 👥</option>
                        </select>
                        <Button
                          size="sm"
                          onClick={saveGroupType}
                          disabled={savingType || draftType === group.type}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setDraftType(group.type);
                            setEditingType(false);
                          }}
                          disabled={savingType}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      isAdmin && (
                        <button
                          onClick={() => setEditingType(true)}
                          className="mt-1 text-xs text-primary font-semibold hover:underline block"
                        >
                          Change Group Type
                        </button>
                      )
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
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${getAvatarColor(member.userId?.name || "Unregistered")}`}>
                          {initial}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-neutral-900 dark:text-dark-text">
                              {member.userId?.name || "Invited Member"}
                              {isCurrentUser ? " (you)" : ""}
                            </p>
                            {!member.userId && (
                              <span
                                title="Unregistered member (invited)"
                                className="inline-flex items-center text-xs text-neutral-400 dark:text-dark-text-tertiary"
                              >
                                ✉️
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                            {member.userId?.email || "Pending registration"}
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
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-dark-text">Simplify group debts</p>
                <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mt-0.5">
                  Minimizes total payment transactions between members.
                </p>
              </div>
              <button
                onClick={async () => {
                  const newVal = group.simplifyDebts !== false ? false : true;
                  try {
                    const response = await fetch(`/api/groups/${groupId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ simplifyDebts: newVal }),
                    });
                    if (response.ok) {
                      const data = await response.json();
                      setGroup(data.group);
                    }
                  } catch (err) {
                    console.error("Failed to toggle simplify debts:", err);
                  }
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  group.simplifyDebts !== false ? "bg-primary" : "bg-neutral-200 dark:bg-dark-bg-tertiary"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    group.simplifyDebts !== false ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            
            <div className="border-t border-neutral-100 dark:border-dark-border/40 pt-3">
              <Button variant="secondary" onClick={openSimplifiedDebts} className="w-full">
                <Wand2 className="mr-2 h-4 w-4" />
                Review debt details
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Expense Report */}
        <Card className="transition-shadow duration-200 hover:shadow-md border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Expense Report
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-neutral-500 dark:text-dark-text-secondary">
              Generate a shareable PDF with all expenses, member balances, and the Smart Settle Up plan. Share via WhatsApp, email, or download directly.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={generateGroupPdf}
                disabled={exportingReport}
              >
                {exportingReport ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating PDF...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Download PDF
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                onClick={handleShareReport}
                disabled={exportingReport}
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
            </div>
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
