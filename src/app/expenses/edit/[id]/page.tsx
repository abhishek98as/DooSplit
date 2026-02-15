"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/lib/auth/react-session";
import { useRouter, useParams } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import ImageUpload from "@/components/ui/ImageUpload";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { ImageType } from "@/lib/storage/image-types";
import { 
  IndianRupee, 
  Receipt, 
  Calendar, 
  Users,
  X,
  Check
} from "lucide-react";

interface Friend {
  _id: string;
  name: string;
  email: string;
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
}

type SplitMethod = "equally" | "exact" | "percentage" | "shares";

export default function EditExpensePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const expenseId = params.id as string;

  // Form state
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [currency, setCurrency] = useState("INR");
  
  // Participants and split
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("equally");
  const [selectedFriends, setSelectedFriends] = useState<Friend[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [paidBy, setPaidBy] = useState<string>("");
  
  // Modal states
  const [showFriendModal, setShowFriendModal] = useState(false);
  
  // Data
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
    if (session?.user?.id) {
      setPaidBy(session.user.id);
      fetchExpense();
      fetchFriends();
      fetchGroups();
    }
  }, [session, expenseId]);

  useEffect(() => {
    if (amount && selectedFriends.length > 0) {
      calculateSplit();
    }
  }, [amount, selectedFriends, splitMethod]);

  const fetchExpense = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/expenses/${expenseId}`);
      if (!response.ok) throw new Error("Failed to fetch expense");
      
      const result = await response.json();
      const data = result.expense; // API returns { expense: { ... } }

      // Populate form fields
      setAmount(data.amount.toString());
      setDescription(data.description);
      setCategory(data.category || "other");
      setDate(new Date(data.date).toISOString().split("T")[0]);
      setNotes(data.notes || "");
      setImages(data.images || []);
      setCurrency(data.currency || "INR");
      // splitMethod is not stored in the database, default to equally for editing
      setSplitMethod("equally");

      // Determine who paid from participants
      const payer = data.participants?.find((p: any) => p.paidAmount > 0);
      setPaidBy(payer?.userId?._id || data.createdBy._id);

      // Set selected group if exists
      if (data.groupId) {
        setSelectedGroup({
          _id: data.groupId._id,
          name: data.groupId.name,
          memberCount: 0
        });
      }

      // Pre-populate participants
      if (data.participants) {
        // Map all participants including the current user
        const participantList = data.participants.map((p: any) => ({
          userId: p.userId._id,
          name: p.userId.name,
          owedAmount: p.owedAmount,
          paidAmount: p.paidAmount,
          isSettled: p.isSettled
        }));
        setParticipants(participantList);

        // Set selected friends (exclude current user)
        const selectedFriendsList = data.participants
          .filter((p: any) => p.userId._id !== session?.user?.id)
          .map((p: any) => ({
            id: p.userId._id,
            friend: {
              id: p.userId._id,
              name: p.userId.name,
              email: p.userId.email || '',
              profilePicture: p.userId.profilePicture,
              isDummy: false
            },
            balance: 0, // We'll calculate this later if needed
            friendshipDate: ''
          }));
        setSelectedFriends(selectedFriendsList);
      }
    } catch (error) {
      console.error("Error fetching expense:", error);
      alert("Failed to load expense");
      router.push("/expenses");
    } finally {
      setLoading(false);
    }
  };

  const fetchFriends = async () => {
    try {
      const res = await fetch("/api/friends");
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
      }
    } catch (error) {
      console.error("Failed to fetch friends:", error);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await fetch("/api/groups");
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
      }
    } catch (error) {
      console.error("Failed to fetch groups:", error);
    }
  };

  // Match selected friends when both expense participants and friends list are loaded
  useEffect(() => {
    if (friends.length > 0 && participants.length > 0 && selectedFriends.length === 0) {
      const matchedFriends = friends.filter(friend =>
        participants.some(p => p.userId === friend._id)
      );
      setSelectedFriends(matchedFriends);
    }
  }, [friends, participants]);

  const calculateSplit = () => {
    const totalAmount = parseFloat(amount) || 0;
    if (totalAmount === 0 || selectedFriends.length === 0) return;

    const numPeople = selectedFriends.length + 1; // +1 for current user
    const newParticipants: Participant[] = [];

    // Add current user
    const userShare = splitMethod === "equally" ? totalAmount / numPeople : 0;
    newParticipants.push({
      userId: session?.user?.id || "",
      name: "You",
      owedAmount: paidBy === session?.user?.id ? 0 : userShare,
      paidAmount: paidBy === session?.user?.id ? totalAmount : 0
    });

    // Add selected friends
    selectedFriends.forEach(friend => {
      const friendShare = splitMethod === "equally" ? totalAmount / numPeople : 0;
      newParticipants.push({
        userId: friend._id,
        name: friend.name,
        owedAmount: paidBy === friend._id ? 0 : friendShare,
        paidAmount: paidBy === friend._id ? totalAmount : 0
      });
    });

    setParticipants(newParticipants);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!amount || !description || selectedFriends.length === 0) {
      alert("Please fill in all required fields and select at least one friend");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`/api/expenses/${expenseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(amount),
          description,
          category,
          date,
          currency,
          groupId: selectedGroup?._id,
          paidBy,
          participants,
          notes,
          images,
          splitMethod
        })
      });

      if (res.ok) {
        router.push("/expenses");
        router.refresh();
      } else {
        const error = await res.json();
        alert(error.message || "Failed to update expense");
      }
    } catch (error) {
      console.error("Failed to update expense:", error);
      alert("Failed to update expense. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFriend = (friend: Friend) => {
    setSelectedFriends(prev => 
      prev.find(f => f._id === friend._id)
        ? prev.filter(f => f._id !== friend._id)
        : [...prev, friend]
    );
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <LoadingSpinner size="lg" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
            Edit Expense
          </h1>
          <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
            Update expense details
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
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
                    className={`p-3 rounded-lg border-2 transition-all ${
                      category === cat.value
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
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedFriends.map(friend => (
                    <span key={friend._id} className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm">
                      {friend.name}
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
              )}
            </div>

            {/* Split method */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Split method
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSplitMethod("equally")}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    splitMethod === "equally"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-neutral-200 dark:border-dark-border text-neutral-700 dark:text-dark-text hover:border-primary"
                  }`}
                >
                  Split Equally
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMethod("exact")}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    splitMethod === "exact"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-neutral-200 dark:border-dark-border text-neutral-700 dark:text-dark-text hover:border-primary"
                  }`}
                >
                  Exact Amounts
                </button>
              </div>
            </div>

            {/* Image Upload */}
            <ImageUpload
              images={images}
              onChange={setImages}
              maxImages={10}
              type={ImageType.EXPENSE}
              entityId={expenseId}
            />

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
                isLoading={submitting}
                className="flex-1"
              >
                Update Expense
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
          title="Select Friends"
        >
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {friends.length === 0 ? (
              <p className="text-center py-8 text-neutral-500">
                No friends yet. Add friends first!
              </p>
            ) : (
              friends.map(friend => {
                const isSelected = selectedFriends.find(f => f._id === friend._id);
                return (
                  <button
                    key={friend._id}
                    type="button"
                    onClick={() => toggleFriend(friend)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-neutral-200 dark:border-dark-border hover:border-primary"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-primary font-semibold">
                          {friend.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">
                          {friend.name}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {friend.email}
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
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setShowFriendModal(false)}>
              Done
            </Button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
