"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSession } from "@/lib/auth/react-session";
import { authFetch } from "@/lib/auth/client-session";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import ImageUpload from "@/components/ui/ImageUpload";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import { AnalyticsEvents } from "@/lib/firebase-analytics";
import Modal from "@/components/ui/Modal";
import {
  IndianRupee,
  Receipt,
  Calendar,
  Users,
  Tag,
  StickyNote,
  X,
  Check,
  Plus,
  Sparkles,
  Loader2,
  UserRoundPlus
} from "lucide-react";
import { ImageType } from "@/lib/storage/image-types";
import getOfflineStore from "@/lib/offline-store";
import { useHapticFeedback } from "@/contexts/HapticFeedbackContext";

interface Friend {
  id: string;
  friend: {
    id: string;
    name: string;
    email: string;
    profilePicture?: string;
    isDummy?: boolean;
  };
  balance: number;
  friendshipDate: string;
}

interface Group {
  _id: string;
  name: string;
  memberCount: number;
}

interface Participant {
  userId: string;
  name: string;
  owedAmount: number;
  paidAmount: number;
  // Additional fields for different split methods
  exactAmount?: number; // For exact split method
  percentage?: number; // For percentage split method
  shares?: number; // For shares split method
}

interface SimulatorRow {
  userId: string;
  name: string;
  owedAmount: number;
  percentage?: number;
}

interface ItemizedItem {
  id: string;
  name: string;
  amount: string;
  assignedTo: string[];
  isShared: boolean;
}

type SplitMethod = "equally" | "exact" | "percentage" | "shares" | "itemized";

function AddExpensePageInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { trackEvent } = useAnalytics();
  const { trigger: triggerHaptic } = useHapticFeedback();
  const groupPrefillDone = useRef(false);

  const [scanLoading, setScanLoading] = useState(false);

  const handleReceiptScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setScanLoading(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64Data = reader.result as string;
          const res = await authFetch("/api/ai/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image: base64Data,
              mimeType: file.type || "image/jpeg"
            })
          });

          const data = await res.json();
          if (data.data) {
            const parsed = data.data;
            if (parsed.amount) setAmount(parsed.amount.toString());
            if (parsed.title) setDescription(parsed.title);
            if (parsed.category) setCategory(parsed.category.toLowerCase());
            if (parsed.date) setDate(parsed.date);
            alert("AI has successfully scanned and populated the receipt details!");
          } else {
            alert(data.error || "Failed to scan receipt with AI.");
          }
        } catch (innerErr) {
          console.error(innerErr);
          alert("Error sending file to AI scanner.");
        } finally {
          setScanLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      alert("Error reading file.");
      setScanLoading(false);
    }
  };

  // Form state
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [currency, setCurrency] = useState("INR");
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [repeatInterval, setRepeatInterval] = useState("1");
  const [repeatReminderEnabled, setRepeatReminderEnabled] = useState(true);
  const [repeatReminderDaysBefore, setRepeatReminderDaysBefore] = useState("1");

  // Participants and split
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("equally");
  const [selectedFriends, setSelectedFriends] = useState<Friend[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [paidBy, setPaidBy] = useState<string>("");
  const [payerMode, setPayerMode] = useState<"single" | "multiple">("single");
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [simulatorMethod, setSimulatorMethod] = useState<"equally" | "exact" | "percentage">("equally");
  const [simPercentageByUser, setSimPercentageByUser] = useState<Record<string, string>>({});
  const [simExactByUser, setSimExactByUser] = useState<Record<string, string>>({});

  // Itemized split state
  const [itemizedItems, setItemizedItems] = useState<ItemizedItem[]>([
    { id: "1", name: "", amount: "", assignedTo: [], isShared: false },
  ]);

  // Modal states
  const [showFriendModal, setShowFriendModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);

  // Data
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Group creation form
  const [groupFormData, setGroupFormData] = useState({
    name: "",
    description: "",
    type: "trip",
    currency: "INR",
    memberIds: [] as string[],
  });

  const categories = [
    { value: "food", label: "Food", icon: "🍔" },
    { value: "transport", label: "Transport", icon: "🚗" },
    { value: "shopping", label: "Shopping", icon: "🛒" },
    { value: "entertainment", label: "Entertainment", icon: "🎬" },
    { value: "utilities", label: "Utilities", icon: "📄" },
    { value: "healthcare", label: "Healthcare", icon: "⚕️" },
    { value: "rent", label: "Rent", icon: "🏠" },
    { value: "other", label: "Other", icon: "📦" }
  ];

  useEffect(() => {
    if (amount) {
      calculateSplit();
    }
  }, [amount, selectedFriends, splitMethod, paidBy, payerMode, payerAmounts]);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    const peopleIds = [
      session.user.id,
      ...selectedFriends.map((friend) => String(friend.friend.id || "")).filter(Boolean),
    ];

    const totalPeople = Math.max(1, peopleIds.length);
    const totalAmount = parseFloat(amount) || 0;
    const equalPercentage = (100 / totalPeople).toFixed(2);
    const equalExact = (totalAmount / totalPeople).toFixed(2);

    setSimPercentageByUser((prev) => {
      const next: Record<string, string> = {};
      for (const id of peopleIds) {
        next[id] = prev[id] ?? equalPercentage;
      }
      return next;
    });

    setSimExactByUser((prev) => {
      const next: Record<string, string> = {};
      for (const id of peopleIds) {
        next[id] = prev[id] ?? equalExact;
      }
      return next;
    });
  }, [amount, selectedFriends, session?.user?.id]);

  const fetchFriends = async (): Promise<Friend[]> => {
    try {
      const res = await authFetch("/api/friends");
      if (res.ok) {
        const data = await res.json();
        const list = (data.friends || []) as Friend[];
        setFriends(list);
        return list;
      }
    } catch (error) {
      console.error("Failed to fetch friends:", error);
    }
    return [];
  };

  const fetchGroups = async (): Promise<Group[]> => {
    try {
      const res = await authFetch("/api/groups");
      if (res.ok) {
        const data = await res.json();
        const list = (data.groups || []) as Group[];
        setGroups(list);
        return list;
      }
    } catch (error) {
      console.error("Failed to fetch groups:", error);
    }
    return [];
  };

  /** Select a group and auto-include its members (incl. guests) in the split. */
  const applyGroupSelection = useCallback(
    async (group: Group | null, friendList?: Friend[]) => {
      setSelectedGroup(group);
      if (!group || !session?.user?.id) {
        return;
      }

      try {
        const res = await authFetch(`/api/groups/${group._id}`);
        if (!res.ok) return;
        const data = await res.json();
        const members: any[] = data.group?.members || [];
        const available = friendList || friends;

        const nextSelected: Friend[] = [];
        for (const member of members) {
          const memberId = String(member.userId?._id || member.userId?.id || "");
          if (!memberId || memberId === session.user.id) continue;

          const existing =
            available.find((f) => String(f.friend?.id) === memberId) ||
            available.find((f) => String(f.id) === memberId);

          if (existing) {
            nextSelected.push(existing);
          } else {
            // Group member not in friends list (edge) — synthesize a selectable row
            nextSelected.push({
              id: `group_member_${memberId}`,
              friend: {
                id: memberId,
                name: member.userId?.name || "Member",
                email: member.userId?.email || "",
                profilePicture: member.userId?.profilePicture,
                isDummy: Boolean(member.userId?.isDummy),
              },
              balance: 0,
              friendshipDate: new Date().toISOString(),
            });
          }
        }
        setSelectedFriends(nextSelected);
      } catch (error) {
        console.error("Failed to load group members for expense:", error);
      }
    },
    [friends, session?.user?.id]
  );

  useEffect(() => {
    if (!session?.user?.id) return;

    setPaidBy(session.user.id);
    void (async () => {
      const [friendList, groupList] = await Promise.all([
        fetchFriends(),
        fetchGroups(),
      ]);

      const groupIdParam = searchParams.get("groupId");
      if (groupIdParam && !groupPrefillDone.current) {
        groupPrefillDone.current = true;
        const match =
          groupList.find((g) => g._id === groupIdParam) ||
          ({ _id: groupIdParam, name: "Group", memberCount: 0 } as Group);
        await applyGroupSelection(match, friendList);
      }
    })();
  }, [session?.user?.id, searchParams, applyGroupSelection]);

  const addGuestFriend = async () => {
    const name = guestName.trim();
    if (!name) return;
    setAddingGuest(true);
    try {
      const res = await authFetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dummyName: name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to add guest");
      }

      const refreshed = await fetchFriends();
      const createdId = String(
        data.friendship?.friend?.id ||
          data.friend?.id ||
          data.friendId ||
          data.user?.id ||
          ""
      );
      const match =
        refreshed.find((f) => String(f.friend?.id) === createdId) ||
        refreshed.find(
          (f) =>
            f.friend?.isDummy &&
            String(f.friend?.name || "").toLowerCase() === name.toLowerCase()
        );

      if (match) {
        setSelectedFriends((prev) =>
          prev.some((f) => f.friend.id === match.friend.id)
            ? prev
            : [...prev, match]
        );
      }

      // If a group is selected, also add the guest to that group
      if (selectedGroup?._id && match?.friend?.id) {
        try {
          await authFetch(`/api/groups/${selectedGroup._id}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: match.friend.id }),
          });
        } catch {
          // Non-fatal — guest is still on the expense
        }
      }

      setGuestName("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to add guest");
    } finally {
      setAddingGuest(false);
    }
  };

  // Helper: round to 2 decimal places
  const round2 = (num: number) => Math.round(num * 100) / 100;

  // Itemized helpers
  const addItemizedItem = () => {
    const newItem: ItemizedItem = {
      id: Date.now().toString(),
      name: "",
      amount: "",
      assignedTo: [],
      isShared: false,
    };
    setItemizedItems((prev) => [...prev, newItem]);
  };

  const removeItemizedItem = (id: string) => {
    setItemizedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItemizedItem = (id: string, updates: Partial<ItemizedItem>) => {
    setItemizedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const toggleItemizedAssignee = (itemId: string, userId: string) => {
    setItemizedItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              assignedTo: item.assignedTo.includes(userId)
                ? item.assignedTo.filter((uid) => uid !== userId)
                : [...item.assignedTo, userId],
            }
          : item
      )
    );
  };

  const itemizedTotal = itemizedItems.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0
  );

  const getSplitPeople = () =>
    [
      ...(session?.user?.id ? [{ id: session.user.id, name: "You" }] : []),
      ...selectedFriends.map((f) => ({
        id: String(f.friend.id || ""),
        name: f.friend.name,
      })),
    ].filter((p) => Boolean(p.id));

  const getPaidAmountForUser = (userId: string, totalAmount: number): number => {
    if (payerMode === "multiple") {
      return round2(parseFloat(payerAmounts[userId] || "0") || 0);
    }
    return paidBy === userId ? totalAmount : 0;
  };

  const buildPayersPayload = (totalAmount: number) => {
    if (payerMode === "multiple") {
      return getSplitPeople()
        .map((person) => ({
          userId: person.id,
          amount: round2(parseFloat(payerAmounts[person.id] || "0") || 0),
        }))
        .filter((p) => p.amount > 0);
    }
    return undefined;
  };

  const calculateItemizedSplit = (): Participant[] => {
    const allPeople = getSplitPeople();

    const owedMap: Record<string, number> = {};
    for (const person of allPeople) {
      owedMap[person.id] = 0;
    }

    for (const item of itemizedItems) {
      const itemAmount = parseFloat(item.amount) || 0;
      if (itemAmount <= 0) continue;

      if (item.isShared) {
        // Split equally among all participants
        const share = round2(itemAmount / allPeople.length);
        const remainder = round2(itemAmount - share * allPeople.length);
        allPeople.forEach((person, idx) => {
          owedMap[person.id] = round2(
            (owedMap[person.id] || 0) + share + (idx === 0 ? remainder : 0)
          );
        });
      } else {
        // Split among assigned people
        const assignees =
          item.assignedTo.length > 0
            ? item.assignedTo.filter((uid) => owedMap[uid] !== undefined)
            : allPeople.map((p) => p.id);
        if (assignees.length === 0) continue;
        const share = round2(itemAmount / assignees.length);
        const remainder = round2(itemAmount - share * assignees.length);
        assignees.forEach((uid, idx) => {
          owedMap[uid] = round2(
            (owedMap[uid] || 0) + share + (idx === 0 ? remainder : 0)
          );
        });
      }
    }

    const totalAmount = itemizedTotal;
    return allPeople.map((person) => ({
      userId: person.id,
      name: person.name,
      owedAmount: owedMap[person.id] || 0,
      paidAmount: getPaidAmountForUser(person.id, totalAmount),
    }));
  };

  // Bug 7 fix: compute correct owedAmount per participant on client side
  const calculateSplit = () => {
    const totalAmount = parseFloat(amount) || 0;
    if (totalAmount === 0) return;

    const newParticipants: Participant[] = [];

    if (selectedFriends.length === 0) {
      // Personal expense — only the current user
      newParticipants.push({
        userId: session?.user?.id || "",
        name: "You",
        owedAmount: totalAmount,
        paidAmount: totalAmount,
      });
      setParticipants(newParticipants);
      return;
    }

    const numPeople = selectedFriends.length + 1; // +1 for current user
    const equalShare = round2(totalAmount / numPeople);
    // Handle rounding: give remainder to first person (current user)
    const remainder = round2(totalAmount - equalShare * numPeople);

    // Add current user
    const userShare = splitMethod === "equally" ? round2(equalShare + remainder) : 0;
    newParticipants.push({
      userId: session?.user?.id || "",
      name: "You",
      owedAmount: splitMethod === "equally" ? userShare : 0,
      paidAmount: getPaidAmountForUser(session?.user?.id || "", totalAmount),
      exactAmount: splitMethod === "exact" ? round2(totalAmount / numPeople) : undefined,
      percentage: splitMethod === "percentage" ? round2(100 / numPeople) : undefined,
      shares: splitMethod === "shares" ? 1 : undefined,
    });

    // Add selected friends
    selectedFriends.forEach(friend => {
      const friendShare = splitMethod === "equally" ? equalShare : 0;
      newParticipants.push({
        userId: friend.friend.id,
        name: friend.friend.name,
        owedAmount: splitMethod === "equally" ? friendShare : 0,
        paidAmount: getPaidAmountForUser(String(friend.friend.id || ""), totalAmount),
        exactAmount: splitMethod === "exact" ? round2(totalAmount / numPeople) : undefined,
        percentage: splitMethod === "percentage" ? round2(100 / numPeople) : undefined,
        shares: splitMethod === "shares" ? 1 : undefined,
      });
    });

    setParticipants(newParticipants);
  };

  const uploadExpenseImages = async (expenseId: string, imageFiles: string[]): Promise<string[]> => {
    const uploadedRefs: string[] = [];

    for (const imageFile of imageFiles) {
      try {
        // Skip temporary local IDs that were not uploaded yet
        if (imageFile.startsWith("temp_") || imageFile.startsWith("local_")) {
          continue;
        }

        // If it's already a stored reference ID, keep it
        if (!imageFile.startsWith('data:')) {
          uploadedRefs.push(imageFile);
          continue;
        }

        // Convert base64 to blob and upload
        const response = await fetch(imageFile);
        const blob = await response.blob();
        const file = new File([blob], `expense-image-${Date.now()}.jpg`, { type: 'image/jpeg' });

        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'expense');
        formData.append('entityId', expenseId);

        const uploadRes = await fetch('/api/images/upload', {
          method: 'POST',
          body: formData,
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          uploadedRefs.push(uploadData.image.id);
        } else {
          console.error('Failed to upload image:', await uploadRes.text());
        }
      } catch (error) {
        console.error('Error uploading expense image:', error);
      }
    }

    return uploadedRefs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // For itemized splits, validate items and auto-fill amount
    if (splitMethod === "itemized") {
      const hasItems = itemizedItems.some((item) => parseFloat(item.amount) > 0);
      if (!hasItems) {
        alert("Please add at least one item with an amount.");
        return;
      }
      if (!description) {
        alert("Please enter a description.");
        return;
      }
      // Auto-set amount from item total
      if (!amount || parseFloat(amount) !== itemizedTotal) {
        setAmount(itemizedTotal.toFixed(2));
      }
    } else if (!amount || !description) {
      alert("Please fill in all required fields");
      return;
    }

    setSubmitting(true);

    try {
      const offlineStore = getOfflineStore();

      // Build personal expense participants if none selected yet
      let resolvedParticipants = participants;
      if (splitMethod === "itemized") {
        resolvedParticipants = calculateItemizedSplit();
      } else if (selectedFriends.length === 0 && resolvedParticipants.length === 0 && session?.user?.id) {
        const totalAmountFallback = parseFloat(amount) || 0;
        resolvedParticipants = [{
          userId: session.user.id,
          name: "You",
          owedAmount: totalAmountFallback,
          paidAmount: totalAmountFallback,
        }];
      }

      // Prepare expense data
      const finalAmount = splitMethod === "itemized" ? itemizedTotal : parseFloat(amount);
      const payers = buildPayersPayload(finalAmount);
      if (payerMode === "multiple") {
        if (!payers || payers.length === 0) {
          alert("Select at least one payer and enter amounts.");
          setSubmitting(false);
          return;
        }
        const payerTotal = payers.reduce((sum, p) => sum + p.amount, 0);
        if (Math.abs(payerTotal - finalAmount) > 0.01) {
          alert(`Payer amounts (₹${payerTotal.toFixed(2)}) must equal expense total (₹${finalAmount.toFixed(2)}).`);
          setSubmitting(false);
          return;
        }
      }
      const expenseData = {
        amount: finalAmount,
        description,
        category,
        date,
        currency,
        groupId: selectedGroup?._id,
        paidBy: payerMode === "single" ? paidBy : undefined,
        payers,
        participants: resolvedParticipants,
        notes,
        images: [], // Empty initially
        splitMethod: splitMethod === "itemized" ? "exact" : splitMethod,
      };

      // Optimistic create — returns immediately; syncs in background
      const expense = await offlineStore.createExpense(expenseData, {
        waitForServer: false,
      });

      // Expense creation is considered successful if we get an expense object
      if (expense && expense._id) {
        // Track successful expense creation
        triggerHaptic("success");
        trackEvent(AnalyticsEvents.EXPENSE_CREATED, {
          amount: parseFloat(amount),
          currency,
          split_method: splitMethod,
          participant_count: participants.length,
          has_images: images.length > 0,
          has_group: !!selectedGroup,
          category,
          optimistic: Boolean((expense as any)._optimistic),
        });

        const isTemp = String(expense._id).startsWith("temp_");
        if (isTemp || (expense as any)._pendingSync) {
          try {
            sessionStorage.setItem(
              "doosplit:last-save-notice",
              navigator.onLine
                ? "Expense saved — syncing in background"
                : "Saved offline — will sync when you reconnect"
            );
          } catch {
            // ignore
          }
        }

        // Step 2: Upload images only once we have a real server id
        let finalImageRefs: string[] = [];
        if (images.length > 0 && navigator.onLine && !isTemp) {
          try {
            finalImageRefs = await uploadExpenseImages(expense._id, images);
            if (finalImageRefs.length > 0) {
              trackEvent(AnalyticsEvents.IMAGE_UPLOADED, {
                count: finalImageRefs.length,
                context: 'expense_creation'
              });
            }
          } catch (uploadError) {
            console.warn("Image upload failed, keeping local-only previews", uploadError);
            trackEvent('image_upload_failed', {
              error: uploadError instanceof Error ? uploadError.message : String(uploadError),
              context: 'expense_creation'
            });
          }
        } else if (images.length > 0 && isTemp) {
          try {
            sessionStorage.setItem(
              "doosplit:last-save-notice",
              "Expense saved. Re-open it after sync to attach the receipt photo."
            );
          } catch {
            // ignore
          }
        }

        // Step 3: Update expense with image references if any were uploaded
        if (finalImageRefs.length > 0) {
          await offlineStore.updateExpense(expense._id, { images: finalImageRefs });
        }

        if (repeatEnabled) {
          try {
            await authFetch("/api/recurring-expenses", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: description,
                frequency: repeatFrequency,
                interval: Number(repeatInterval) || 1,
                dayOfMonth: new Date(date).getDate(),
                startDate: date,
                timezone: "Asia/Kolkata",
                reminderEnabled: repeatReminderEnabled,
                reminderDaysBefore: Number(repeatReminderDaysBefore) || 0,
                expense: {
                  ...expenseData,
                  images: finalImageRefs,
                  paymentStatus: "unpaid",
                },
              }),
            });
          } catch (recurringError) {
            console.warn("Expense saved, but recurring template creation failed", recurringError);
          }
        }

        // Signal dashboard to force-refresh when it mounts.
        // We use sessionStorage instead of a window event because the event
        // would be lost if the dashboard page isn't mounted yet.
        try {
          sessionStorage.setItem("doosplit:force-refresh", Date.now().toString());
        } catch {
          // sessionStorage may be unavailable in some browsers
        }

        // Navigate quickly — don't wait on cache bust for optimistic feel
        const dest = selectedGroup?._id
          ? `/groups/${selectedGroup._id}`
          : "/expenses";
        router.push(dest);

        // Best-effort cache refresh in background
        void Promise.allSettled([
          fetch("/api/friends", { cache: "reload" }).catch(() => {}),
          fetch("/api/dashboard/activity", { cache: "reload" }).catch(() => {}),
        ]);
      } else {
        triggerHaptic("error");
        alert("Failed to create expense");
      }
    } catch (error) {
      console.error("Failed to create expense:", error);
      triggerHaptic("error");
      alert("Failed to create expense. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFriend = (friend: Friend) => {
    setSelectedFriends(prev =>
      prev.find(f => f.id === friend.id)
        ? prev.filter(f => f.id !== friend.id)
        : [...prev, friend]
    );
  };

  const createGroup = async () => {
    if (!groupFormData.name.trim()) {
      alert("Please enter a group name");
      return;
    }

    if (groupFormData.memberIds.length === 0) {
      alert("Please select at least one member for the group");
      return;
    }

    setCreatingGroup(true);
    try {
      const res = await authFetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(groupFormData),
      });

      if (res.ok) {
        const newGroup = await res.json();
        // Refresh groups
        await fetchGroups();
        // Set the newly created group as selected
        if (newGroup?.group?._id) {
          setSelectedGroup({
            _id: newGroup.group._id,
            name: newGroup.group.name,
            memberCount: Number(newGroup.group.memberCount || newGroup.group.members?.length || 0),
          });
        } else if (newGroup?.groupId) {
          setSelectedGroup({
            _id: String(newGroup.groupId),
            name: groupFormData.name.trim(),
            memberCount: groupFormData.memberIds.length + 1,
          });
        }
        // Clear form
        setGroupFormData({
          name: "",
          description: "",
          type: "trip",
          currency: "INR",
          memberIds: [],
        });
        setShowCreateGroupModal(false);
        setShowFriendModal(false);
      } else {
        const error = await res.json();
        alert(`Failed to create group: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("Failed to create group:", error);
      alert("Failed to create group. Please try again.");
    } finally {
      setCreatingGroup(false);
    }
  };

  const toggleGroupMemberSelection = (friendId: string) => {
    setGroupFormData((prev) => ({
      ...prev,
      memberIds: prev.memberIds.includes(friendId)
        ? prev.memberIds.filter((id) => id !== friendId)
        : [...prev.memberIds, friendId],
    }));
  };

  const simulatorPeople = [
    ...(session?.user?.id
      ? [{ id: session.user.id, name: "You" }]
      : []),
    ...selectedFriends.map((friend) => ({
      id: String(friend.friend.id || ""),
      name: friend.friend.name,
    })),
  ].filter((person) => Boolean(person.id));

  const simulatorAmount = parseFloat(amount) || 0;

  const simulatorRows: SimulatorRow[] = (() => {
    if (simulatorPeople.length === 0) {
      return [];
    }

    const round2 = (value: number) => Math.round(value * 100) / 100;

    if (simulatorMethod === "equally") {
      const equalShare = round2(simulatorAmount / simulatorPeople.length);
      const remainder = round2(simulatorAmount - equalShare * simulatorPeople.length);
      return simulatorPeople.map((person, index) => ({
        userId: person.id,
        name: person.name,
        owedAmount: index === 0 ? round2(equalShare + remainder) : equalShare,
      }));
    }

    if (simulatorMethod === "percentage") {
      const rows = simulatorPeople.map((person) => {
        const percentage = Number(simPercentageByUser[person.id] || 0);
        return {
          userId: person.id,
          name: person.name,
          percentage,
          owedAmount: round2((simulatorAmount * percentage) / 100),
        };
      });

      const totalAllocated = round2(rows.reduce((sum, row) => sum + row.owedAmount, 0));
      const diff = round2(simulatorAmount - totalAllocated);
      if (rows.length > 0 && diff !== 0) {
        rows[0].owedAmount = round2(rows[0].owedAmount + diff);
      }
      return rows;
    }

    return simulatorPeople.map((person) => ({
      userId: person.id,
      name: person.name,
      owedAmount: round2(Number(simExactByUser[person.id] || 0)),
    }));
  })();

  const simulatorOwedTotal = simulatorRows.reduce(
    (sum, row) => sum + Number(row.owedAmount || 0),
    0
  );
  const simulatorPercentageTotal = simulatorRows.reduce(
    (sum, row) => sum + Number(row.percentage || 0),
    0
  );

  return (
    <AppShell>
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
        <div className="md:hidden">
          <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
            Add Expense
          </h1>
          <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
            Record a new shared expense
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* AI Receipt Scanner Widget */}
            <div className="p-4 bg-gradient-to-br from-primary/5 to-coral/5 border-2 border-dashed border-primary/20 rounded-xl relative overflow-hidden dark:bg-dark-bg-secondary">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  {scanLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Sparkles className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-bold text-neutral-800 dark:text-dark-text">AI Receipt Scanner</h3>
                  <p className="text-[10px] text-neutral-500 dark:text-dark-text-tertiary mt-0.5">
                    Upload a receipt or screenshot to auto-fill this form instantly
                  </p>
                </div>
                <label className="py-1.5 px-3 bg-primary hover:bg-primary-dark text-white rounded-lg text-xs font-bold shadow-sm cursor-pointer transition-all active:scale-[0.98] shrink-0">
                  <span>{scanLoading ? "Scanning..." : "Upload Bill"}</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleReceiptScan}
                    disabled={scanLoading}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Amount <span className="text-error">*</span>
              </label>
              <div className="relative">
                <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-neutral-400" />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full h-14 pl-14 pr-4 text-2xl font-semibold font-mono border-2 border-neutral-200 dark:border-dark-border rounded-md focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Description <span className="text-error">*</span>
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this for?"
                icon={<Receipt className="h-5 w-5" />}
                required
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Category
              </label>
              <div className="grid grid-cols-4 gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`p-3 rounded-lg border-2 transition-all ${category === cat.value
                        ? "border-primary bg-primary/10"
                        : "border-neutral-200 dark:border-dark-border hover:border-primary"
                      }`}
                  >
                    <div className="text-2xl mb-1">{cat.icon}</div>
                    <div className="text-xs font-medium">{cat.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Date
              </label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                icon={<Calendar className="h-5 w-5" />}
              />
            </div>

            {/* Group Selection */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Group (Optional)
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedGroup?._id || ""}
                  onChange={(e) => {
                    const groupId = e.target.value;
                    if (groupId) {
                      const group = groups.find(g => g._id === groupId);
                      void applyGroupSelection(group || null);
                    } else {
                      setSelectedGroup(null);
                    }
                  }}
                  className="flex-1 px-4 py-3 border-2 border-neutral-200 dark:border-dark-border rounded-md focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
                >
                  <option value="">No Group (Non-Group Expense)</option>
                  {groups.map((group) => (
                    <option key={group._id} value={group._id}>
                      {group.name} ({group.memberCount} members)
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowGroupModal(true)}
                  className="px-4"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {selectedGroup && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                    <span className="mr-1">👥</span>
                    With you and: All of {selectedGroup.name}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGroup(null);
                    }}
                    className="text-xs text-neutral-500 hover:text-neutral-700"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Split with */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Split with <span className="text-error">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowFriendModal(true)}
                className="w-full flex items-center justify-between p-3 border-2 border-neutral-200 dark:border-dark-border rounded-md hover:border-primary transition-colors bg-white dark:bg-dark-bg-secondary"
              >
                <span className="text-sm font-medium text-neutral-700 dark:text-dark-text">
                  {selectedFriends.length === 0
                    ? "Select friends"
                    : `${selectedFriends.length} friend${selectedFriends.length > 1 ? "s" : ""} selected`}
                </span>
                <Users className="h-5 w-5 text-neutral-400" />
              </button>
              {selectedFriends.length > 0 && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {selectedFriends.map(friend => (
                      <span key={friend.id} className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm">
                        {friend.friend.name}
                        {friend.friend.isDummy && (
                          <span className="text-[10px] font-bold uppercase text-amber-700 bg-amber-100 px-1 rounded">
                            Guest
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleFriend(friend)}
                          className="hover:bg-primary/20 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  {!selectedGroup && (
                    <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      <span className="mr-1">📝</span>
                      Non-Group Expense
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Split method */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Split method
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSplitMethod("equally")}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${splitMethod === "equally"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-neutral-200 dark:border-dark-border text-neutral-700 dark:text-dark-text hover:border-primary"
                    }`}
                >
                  Split Equally
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMethod("exact")}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${splitMethod === "exact"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-neutral-200 dark:border-dark-border text-neutral-700 dark:text-dark-text hover:border-primary"
                    }`}
                >
                  Exact Amounts
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMethod("itemized")}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${splitMethod === "itemized"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-neutral-200 dark:border-dark-border text-neutral-700 dark:text-dark-text hover:border-primary"
                    }`}
                >
                  By Item 🍽️
                </button>
              </div>
            </div>

            {/* Paid by */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text">
                  Paid by
                </label>
                <div className="flex gap-1 rounded-lg border border-neutral-200 dark:border-dark-border p-0.5">
                  <button
                    type="button"
                    onClick={() => setPayerMode("single")}
                    className={`min-h-10 px-3.5 py-2 text-sm font-medium rounded-xl transition-all ${
                      payerMode === "single"
                        ? "bg-primary text-white"
                        : "text-neutral-600 dark:text-dark-text-secondary"
                    }`}
                  >
                    One person
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPayerMode("multiple");
                      const people = getSplitPeople();
                      const total =
                        splitMethod === "itemized" ? itemizedTotal : parseFloat(amount) || 0;
                      if (Object.keys(payerAmounts).length === 0 && paidBy && total > 0) {
                        setPayerAmounts({ [paidBy]: total.toFixed(2) });
                      } else if (Object.keys(payerAmounts).length === 0 && people[0]) {
                        setPayerAmounts({
                          [people[0].id]: (total > 0 ? total : 0).toFixed(2),
                        });
                      }
                    }}
                    className={`min-h-10 px-3.5 py-2 text-sm font-medium rounded-xl transition-all ${
                      payerMode === "multiple"
                        ? "bg-primary text-white"
                        : "text-neutral-600 dark:text-dark-text-secondary"
                    }`}
                  >
                    Multiple
                  </button>
                </div>
              </div>

              {payerMode === "single" ? (
                <div className="flex flex-wrap gap-2">
                  {getSplitPeople().map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => setPaidBy(person.id)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                        paidBy === person.id
                          ? "bg-primary text-white"
                          : "bg-neutral-100 dark:bg-dark-bg-tertiary text-neutral-700 dark:text-dark-text-secondary hover:bg-primary/20"
                      }`}
                    >
                      {person.name}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 rounded-xl border border-neutral-200 dark:border-dark-border p-3">
                  {getSplitPeople().map((person) => {
                    const isPayer = person.id in payerAmounts;
                    return (
                      <div
                        key={person.id}
                        className="flex items-center gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setPayerAmounts((prev) => {
                              const next = { ...prev };
                              if (person.id in next) {
                                delete next[person.id];
                              } else {
                                next[person.id] = "0";
                              }
                              return next;
                            });
                          }}
                          className={`min-w-[5.5rem] px-2 py-1 rounded-full text-xs font-medium transition-all ${
                            isPayer
                              ? "bg-primary text-white"
                              : "bg-neutral-100 dark:bg-dark-bg-tertiary text-neutral-600"
                          }`}
                        >
                          {person.name}
                        </button>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={!isPayer}
                          value={payerAmounts[person.id] ?? ""}
                          onChange={(e) =>
                            setPayerAmounts((prev) => ({
                              ...prev,
                              [person.id]: e.target.value,
                            }))
                          }
                          placeholder="0.00"
                          className="flex-1"
                        />
                      </div>
                    );
                  })}
                  {(() => {
                    const total =
                      splitMethod === "itemized" ? itemizedTotal : parseFloat(amount) || 0;
                    const paidTotal = Object.values(payerAmounts).reduce(
                      (sum, v) => sum + (parseFloat(v) || 0),
                      0
                    );
                    const remaining = round2(total - paidTotal);
                    return (
                      <p
                        className={`text-xs ${
                          Math.abs(remaining) < 0.01
                            ? "text-green-600"
                            : "text-amber-600"
                        }`}
                      >
                        {Math.abs(remaining) < 0.01
                          ? "Payer amounts match the total"
                          : `Remaining to assign: ₹${remaining.toFixed(2)}`}
                      </p>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Itemized Split Section */}
            {splitMethod === "itemized" && (
              <div className="rounded-xl border-2 border-primary/30 p-4 space-y-4 bg-primary/5 dark:bg-primary/10">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-dark-text">🍽️ Item-level Split</h3>
                    <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mt-0.5">
                      Assign each item to the person who ordered it.
                    </p>
                  </div>
                  {itemizedTotal > 0 && (
                    <span className="text-sm font-bold font-mono text-primary">
                      ₹{itemizedTotal.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Participant pills for selection */}
                {selectedFriends.length === 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                    💡 Select friends above to assign items to specific people.
                  </p>
                )}

                <div className="space-y-3">
                  {itemizedItems.map((item, idx) => {
                    const allPeople = [
                      ...(session?.user?.id ? [{ id: session.user.id, name: "You" }] : []),
                      ...selectedFriends.map((f) => ({ id: String(f.friend.id || ""), name: f.friend.name })),
                    ].filter((p) => Boolean(p.id));

                    return (
                      <div
                        key={item.id}
                        className="bg-white dark:bg-dark-bg-secondary rounded-xl p-3 border border-neutral-200 dark:border-dark-border space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-400 text-xs font-medium w-5 shrink-0">{idx + 1}.</span>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateItemizedItem(item.id, { name: e.target.value })}
                            placeholder="Item name (e.g. Pasta)"
                            className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-neutral-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text focus:outline-none focus:border-primary"
                          />
                          <div className="relative shrink-0">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">₹</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.amount}
                              onChange={(e) => updateItemizedItem(item.id, { amount: e.target.value })}
                              placeholder="0.00"
                              className="w-24 pl-5 pr-2 py-1.5 text-sm border border-neutral-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text focus:outline-none focus:border-primary font-mono"
                            />
                          </div>
                          {itemizedItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItemizedItem(item.id)}
                              className="shrink-0 h-7 w-7 flex items-center justify-center rounded-full text-neutral-400 hover:text-error hover:bg-error/10 transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        {/* Assignment section */}
                        <div className="flex flex-wrap items-center gap-1.5 pl-5">
                          <label className="flex items-center gap-1.5 text-xs text-neutral-500 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.isShared}
                              onChange={(e) => updateItemizedItem(item.id, { isShared: e.target.checked, assignedTo: [] })}
                              className="rounded border-neutral-300"
                            />
                            Shared (split equally)
                          </label>
                          {!item.isShared && allPeople.length > 1 && (
                            <>
                              <span className="text-neutral-300 text-xs">|</span>
                              {allPeople.map((person) => {
                                const isAssigned = item.assignedTo.includes(person.id);
                                return (
                                  <button
                                    key={person.id}
                                    type="button"
                                    onClick={() => toggleItemizedAssignee(item.id, person.id)}
                                    className={`px-2 py-0.5 rounded-full text-xs font-medium transition-all ${
                                      isAssigned
                                        ? "bg-primary text-white"
                                        : "bg-neutral-100 dark:bg-dark-bg-tertiary text-neutral-600 dark:text-dark-text-secondary hover:bg-primary/20"
                                    }`}
                                  >
                                    {person.name}
                                  </button>
                                );
                              })}
                            </>
                          )}
                          {!item.isShared && item.assignedTo.length === 0 && allPeople.length > 1 && (
                            <span className="text-xs text-neutral-400 italic">Tap names to assign →</span>
                          )}
                          {!item.isShared && item.assignedTo.length === 0 && allPeople.length <= 1 && (
                            <span className="text-xs text-neutral-400 italic">Assigned to you</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={addItemizedItem}
                  className="w-full py-2 px-4 border-2 border-dashed border-primary/30 rounded-xl text-sm font-medium text-primary hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Item
                </button>

                {/* Per-person summary */}
                {itemizedTotal > 0 && (() => {
                  const preview = calculateItemizedSplit();
                  return preview.length > 0 ? (
                    <div className="rounded-lg bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border overflow-hidden">
                      <div className="grid grid-cols-2 px-3 py-2 text-xs font-semibold bg-neutral-100 dark:bg-dark-bg-tertiary">
                        <span>Person</span>
                        <span className="text-right">Owes</span>
                      </div>
                      {preview.map((row) => (
                        <div key={row.userId} className="grid grid-cols-2 px-3 py-2 text-sm border-t border-neutral-100 dark:border-dark-border">
                          <span>{row.name}</span>
                          <span className="text-right font-mono">₹{Number(row.owedAmount).toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="grid grid-cols-2 px-3 py-2 text-xs font-semibold border-t border-neutral-200 dark:border-dark-border bg-neutral-50 dark:bg-dark-bg-tertiary">
                        <span>Total</span>
                        <span className="text-right font-mono">₹{itemizedTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            {/* What-if Split Simulator */}
            {selectedFriends.length > 0 && (
              <div className="rounded-xl border-2 border-dashed border-primary/30 p-4 space-y-3 bg-primary/5 dark:bg-primary/10">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-dark-text">
                    What-if Split Simulator
                  </h3>
                  <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mt-1">
                    Test different split outcomes before saving this expense.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSimulatorMethod("equally")}
                    className={`p-2 rounded-lg text-xs font-medium border ${
                      simulatorMethod === "equally"
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-neutral-200 dark:border-dark-border text-neutral-700 dark:text-dark-text bg-white dark:bg-dark-bg-secondary"
                    }`}
                  >
                    Equally
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimulatorMethod("percentage")}
                    className={`p-2 rounded-lg text-xs font-medium border ${
                      simulatorMethod === "percentage"
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-neutral-200 dark:border-dark-border text-neutral-700 dark:text-dark-text bg-white dark:bg-dark-bg-secondary"
                    }`}
                  >
                    Percentage
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimulatorMethod("exact")}
                    className={`p-2 rounded-lg text-xs font-medium border ${
                      simulatorMethod === "exact"
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-neutral-200 dark:border-dark-border text-neutral-700 dark:text-dark-text bg-white dark:bg-dark-bg-secondary"
                    }`}
                  >
                    Exact
                  </button>
                </div>

                {simulatorMethod === "percentage" && (
                  <div className="space-y-2">
                    {simulatorPeople.map((person) => (
                      <div key={person.id} className="flex items-center gap-2">
                        <span className="text-xs w-24 truncate text-neutral-700 dark:text-dark-text">{person.name}</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={simPercentageByUser[person.id] || ""}
                          onChange={(e) =>
                            setSimPercentageByUser((prev) => ({
                              ...prev,
                              [person.id]: e.target.value,
                            }))
                          }
                          className="flex-1 min-h-10 px-3 py-2 text-sm border border-neutral-300 dark:border-dark-border rounded-xl bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
                        />
                        <span className="text-xs text-neutral-500 dark:text-dark-text-secondary">%</span>
                      </div>
                    ))}
                    <p className="text-xs text-neutral-500 dark:text-dark-text-secondary">
                      Total percentage: {simulatorPercentageTotal.toFixed(2)}%
                    </p>
                  </div>
                )}

                {simulatorMethod === "exact" && (
                  <div className="space-y-2">
                    {simulatorPeople.map((person) => (
                      <div key={person.id} className="flex items-center gap-2">
                        <span className="text-xs w-24 truncate text-neutral-700 dark:text-dark-text">{person.name}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={simExactByUser[person.id] || ""}
                          onChange={(e) =>
                            setSimExactByUser((prev) => ({
                              ...prev,
                              [person.id]: e.target.value,
                            }))
                          }
                          className="flex-1 min-h-10 px-3 py-2 text-sm border border-neutral-300 dark:border-dark-border rounded-xl bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-lg bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border overflow-hidden">
                  <div className="grid grid-cols-2 px-3 py-2 text-xs font-semibold bg-neutral-100 dark:bg-dark-bg-tertiary">
                    <span>Participant</span>
                    <span className="text-right">Owes</span>
                  </div>
                  {simulatorRows.map((row) => (
                    <div key={row.userId} className="grid grid-cols-2 px-3 py-2 text-sm border-t border-neutral-100 dark:border-dark-border">
                      <span>{row.name}</span>
                      <span className="text-right font-mono">₹{Number(row.owedAmount || 0).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 px-3 py-2 text-xs font-semibold border-t border-neutral-200 dark:border-dark-border bg-neutral-50 dark:bg-dark-bg-tertiary">
                    <span>Total</span>
                    <span className="text-right font-mono">₹{simulatorOwedTotal.toFixed(2)}</span>
                  </div>
                </div>

                {simulatorMethod === "percentage" && Math.abs(simulatorPercentageTotal - 100) > 0.01 && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Percentage total should be close to 100% for a balanced split.
                  </p>
                )}
                {simulatorMethod === "exact" && Math.abs(simulatorOwedTotal - simulatorAmount) > 0.01 && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Exact amounts should add up to ₹{simulatorAmount.toFixed(2)}.
                  </p>
                )}
              </div>
            )}

            {/* Image Upload */}
            <ImageUpload
              images={images}
              onChange={setImages}
              maxImages={10}
              type={ImageType.EXPENSE}
              entityId="new-expense" // Will be replaced with actual expense ID after creation
              deferUpload
            />

            {/* Recurring */}
            <div className="space-y-3 rounded-md border border-neutral-200 dark:border-dark-border p-4 bg-neutral-50 dark:bg-dark-bg-secondary/40">
              <label className="flex items-center gap-3 text-sm font-medium text-neutral-800 dark:text-dark-text">
                <input
                  type="checkbox"
                  checked={repeatEnabled}
                  onChange={(e) => setRepeatEnabled(e.target.checked)}
                  className="rounded border-neutral-300"
                />
                Repeat this expense automatically
              </label>

              {repeatEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 dark:text-dark-text-secondary mb-1">
                      Frequency
                    </label>
                    <select
                      value={repeatFrequency}
                      onChange={(e) => setRepeatFrequency(e.target.value as "weekly" | "monthly" | "yearly")}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  <Input
                    label="Every"
                    type="number"
                    min="1"
                    max="24"
                    value={repeatInterval}
                    onChange={(e) => setRepeatInterval(e.target.value)}
                  />
                  <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-dark-text">
                    <input
                      type="checkbox"
                      checked={repeatReminderEnabled}
                      onChange={(e) => setRepeatReminderEnabled(e.target.checked)}
                      className="rounded border-neutral-300"
                    />
                    Remind before it runs
                  </label>
                  <Input
                    label="Reminder days before"
                    type="number"
                    min="0"
                    max="14"
                    value={repeatReminderDaysBefore}
                    onChange={(e) => setRepeatReminderDaysBefore(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any additional notes..."
                rows={3}
                className="w-full px-4 py-3 border-2 border-neutral-200 dark:border-dark-border rounded-md focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
              />
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.back()}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? "Saving..." : "Save Expense"}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {/* Friend Selection Modal */}
      {showFriendModal && (
        <Modal
          isOpen={showFriendModal}
          onClose={() => setShowFriendModal(false)}
          title="Select people"
        >
          <div className="mb-4 rounded-xl border border-neutral-200 dark:border-dark-border p-3 space-y-2">
            <p className="text-xs font-semibold text-neutral-600 dark:text-dark-text-secondary flex items-center gap-1.5">
              <UserRoundPlus className="h-3.5 w-3.5" />
              Add guest (no account needed)
            </p>
            <div className="flex gap-2">
              <Input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Name"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                disabled={addingGuest || !guestName.trim()}
                onClick={() => void addGuestFriend()}
              >
                {addingGuest ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
              </Button>
            </div>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {friends.length === 0 ? (
              <p className="text-center py-8 text-neutral-500">
                No friends yet. Add a guest above or invite friends.
              </p>
            ) : (
              friends.map(friend => {
                const isSelected = selectedFriends.find(f => f.id === friend.id);
                const isGuest = Boolean(friend.friend.isDummy);
                return (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => toggleFriend(friend)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${isSelected
                        ? "border-primary bg-primary/10"
                        : "border-neutral-200 dark:border-dark-border hover:border-primary"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-primary font-semibold">
                          {friend.friend.name?.charAt(0)?.toUpperCase() || "?"}
                        </span>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-neutral-900 dark:text-dark-text flex items-center gap-2">
                          {friend.friend.name || friend.friend.email || "Unknown"}
                          {isGuest && (
                            <span className="text-[10px] font-bold uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                              Guest
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {isGuest ? "Unregistered contact" : friend.friend.email}
                        </p>
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-neutral-200 dark:border-dark-border pt-4 mt-3">
            <Button
              onClick={() => {
                setShowFriendModal(false);
                setShowCreateGroupModal(true);
              }}
              variant="outline"
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create New Group
            </Button>
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={() => setShowFriendModal(false)}>
              Done
            </Button>
          </div>
        </Modal>
      )}

      {/* Group Selection Modal */}
      {showGroupModal && (
        <Modal
          isOpen={showGroupModal}
          onClose={() => setShowGroupModal(false)}
          title="Select Group"
        >
          <div className="space-y-4">
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {groups.length === 0 ? (
                <p className="text-center py-8 text-neutral-500">
                  No groups yet. Create your first group!
                </p>
              ) : (
                groups.map(group => {
                  const isSelected = selectedGroup?._id === group._id;
                  return (
                    <button
                      key={group._id}
                      type="button"
                      onClick={() => {
                        void applyGroupSelection(group);
                        setShowGroupModal(false);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${isSelected
                          ? "border-primary bg-primary/10"
                          : "border-neutral-200 dark:border-dark-border hover:border-primary"
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                          <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">
                            {group.name}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-neutral-200 dark:border-dark-border pt-4">
              <Button
                onClick={() => {
                  setShowGroupModal(false);
                  setShowCreateGroupModal(true);
                }}
                variant="outline"
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New Group
              </Button>
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedGroup(null);
                  setShowGroupModal(false);
                }}
                className="flex-1"
              >
                No Group
              </Button>
              <Button onClick={() => setShowGroupModal(false)} className="flex-1">
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <Modal
          isOpen={showCreateGroupModal}
          onClose={() => {
            setShowCreateGroupModal(false);
            setGroupFormData({
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
              value={groupFormData.name}
              onChange={(e) =>
                setGroupFormData((prev) => ({ ...prev, name: e.target.value }))
              }
            />

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Description
              </label>
              <textarea
                value={groupFormData.description}
                onChange={(e) =>
                  setGroupFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="What's this group for?"
                className="w-full px-4 py-3 border-2 border-neutral-200 dark:border-dark-border rounded-md focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Type
              </label>
              <select
                value={groupFormData.type}
                onChange={(e) =>
                  setGroupFormData((prev) => ({ ...prev, type: e.target.value }))
                }
                className="w-full px-4 py-3 border-2 border-neutral-200 dark:border-dark-border rounded-md focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
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
                      key={friend.id}
                      className="flex items-center gap-3 p-2 hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={groupFormData.memberIds.includes(friend.friend.id)}
                        onChange={() => toggleGroupMemberSelection(friend.friend.id)}
                        className="rounded border-neutral-300"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{friend.friend.name}</p>
                        <p className="text-xs text-neutral-500">{friend.friend.email}</p>
                      </div>
                      {friend.balance !== 0 && (
                        <div className="text-right">
                          <span className={`text-xs font-medium ${friend.balance > 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                            }`}>
                            {friend.balance > 0 ? '+' : ''}₹{Math.abs(friend.balance)}
                          </span>
                        </div>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowCreateGroupModal(false)}
                className="flex-1"
                disabled={creatingGroup}
              >
                Cancel
              </Button>
              <Button
                onClick={createGroup}
                className="flex-1"
                disabled={creatingGroup}
              >
                {creatingGroup ? "Creating..." : "Create Group"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}

export default function AddExpensePage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="p-6 flex items-center justify-center min-h-[40vh]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </AppShell>
      }
    >
      <AddExpensePageInner />
    </Suspense>
  );
}
