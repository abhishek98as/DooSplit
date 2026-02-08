"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import ImageUpload from "@/components/ui/ImageUpload";
import Modal from "@/components/ui/Modal";
import {
  IndianRupee,
  Receipt,
  Calendar,
  Users,
  Tag,
  StickyNote,
  X,
  Check
} from "lucide-react";
import { ImageType } from "@/lib/imagekit-service";
import getOfflineStore from "@/lib/offline-store";

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

type SplitMethod = "equally" | "exact" | "percentage" | "shares";

export default function AddExpensePage() {
  const { data: session } = useSession();
  const router = useRouter();

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
  const [showSplitModal, setShowSplitModal] = useState(false);
  
  // Data
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const categories = [
    { value: "food", label: "Food", icon: "🍔" },
    { value: "transport", label: "Transport", icon: "🚗" },
    { value: "shopping", label: "Shopping", icon: "🛒" },
    { value: "entertainment", label: "Entertainment", icon: "🎬" },
    { value: "bills", label: "Bills", icon: "📄" },
    { value: "healthcare", label: "Healthcare", icon: "⚕️" },
    { value: "travel", label: "Travel", icon: "✈️" },
    { value: "other", label: "Other", icon: "📦" }
  ];

  useEffect(() => {
    if (session?.user?.id) {
      setPaidBy(session.user.id);
      fetchFriends();
      fetchGroups();
    }
  }, [session]);

  useEffect(() => {
    if (amount && selectedFriends.length > 0) {
      calculateSplit();
    }
  }, [amount, selectedFriends, splitMethod]);

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
        setGroups(data);
      }
    } catch (error) {
      console.error("Failed to fetch groups:", error);
    }
  };

  const calculateSplit = () => {
    const totalAmount = parseFloat(amount) || 0;
    if (totalAmount === 0 || selectedFriends.length === 0) return;

    const numPeople = selectedFriends.length + 1; // +1 for current user
    const newParticipants: Participant[] = [];

    // Add current user
    newParticipants.push({
      userId: session?.user?.id || "",
      name: "You",
      owedAmount: 0, // Will be calculated by backend
      paidAmount: paidBy === session?.user?.id ? totalAmount : 0,
      // Initialize split-specific fields with default values
      exactAmount: splitMethod === "exact" ? totalAmount / numPeople : undefined,
      percentage: splitMethod === "percentage" ? 100 / numPeople : undefined,
      shares: splitMethod === "shares" ? 1 : undefined,
    });

    // Add selected friends
    selectedFriends.forEach(friend => {
      newParticipants.push({
        userId: friend.friend.id,
        name: friend.friend.name,
        owedAmount: 0, // Will be calculated by backend
        paidAmount: paidBy === friend.friend.id ? totalAmount : 0,
        // Initialize split-specific fields with default values
        exactAmount: splitMethod === "exact" ? totalAmount / numPeople : undefined,
        percentage: splitMethod === "percentage" ? 100 / numPeople : undefined,
        shares: splitMethod === "shares" ? 1 : undefined,
      });
    });

    setParticipants(newParticipants);
  };

  const uploadExpenseImages = async (expenseId: string, imageFiles: string[]): Promise<string[]> => {
    const uploadedRefs: string[] = [];

    for (const imageFile of imageFiles) {
      try {
        // If it's already a reference ID (from re-upload), keep it
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
    
    if (!amount || !description || selectedFriends.length === 0) {
      alert("Please fill in all required fields and select at least one friend");
      return;
    }

    setSubmitting(true);

    try {
      const offlineStore = getOfflineStore();

      // Prepare expense data
      const expenseData = {
        amount: parseFloat(amount),
        description,
        category,
        date,
        currency,
        groupId: selectedGroup?._id,
        paidBy,
        participants,
        notes,
        images: [], // Empty initially
        splitMethod
      };

      // Try to create expense using offline store (will queue if offline)
      const result = await offlineStore.createExpense(expenseData);

      if (result.success) {
        // Step 2: Upload images if any (only if online)
        if (images.length > 0 && navigator.onLine) {
          const finalImageRefs = await uploadExpenseImages(result.expense._id, images);
          // Step 3: Update expense with image references if any were uploaded
          if (finalImageRefs.length > 0) {
            await offlineStore.updateExpense(result.expense._id, { images: finalImageRefs });
          }
        }
        router.push("/dashboard");
        router.refresh();
      } else {
        alert(result.error || "Failed to create expense");
      }
    } catch (error) {
      console.error("Failed to create expense:", error);
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

  return (
    <AppShell>
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
            Add Expense
          </h1>
          <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
            Record a new shared expense
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
                onClick={() =>setShowFriendModal(true)}
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
              entityId="new-expense" // Will be replaced with actual expense ID after creation
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
          title="Select Friends"
        >
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {friends.length === 0 ? (
              <p className="text-center py-8 text-neutral-500">
                No friends yet. Add friends first!
              </p>
            ) : (
              friends.map(friend => {
                const isSelected = selectedFriends.find(f => f.id === friend.id);
                return (
                  <button
                    key={friend.id}
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
                          {friend.friend.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">
                          {friend.friend.name}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {friend.friend.email}
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
