"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import Card, { CardContent } from "@/components/ui/Card";
import { Clock, Receipt, DollarSign, UserPlus } from "lucide-react";

interface Activity {
  type: "expense" | "settlement" | "friend_request";
  id: string;
  timestamp: string;
  data: any;
}

export default function ActivityPage() {
  const { data: session } = useSession();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session) {
      fetchActivities();
    }
  }, [session]);

  const fetchActivities = async () => {
    try {
      const res = await fetch("/api/activities");
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
      }
    } catch (error) {
      console.error("Failed to fetch activities:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  const renderActivity = (activity: Activity) => {
    const { type, data, timestamp } = activity;

    switch (type) {
      case "expense":
        return (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-900 dark:text-dark-text">
                <span className="font-medium">{data.createdBy.name}</span> added{" "}
                <span className="font-medium">{data.description}</span>
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-semibold text-primary">
                  {formatCurrency(data.amount)}
                </span>
                <span className="text-xs text-neutral-500">
                  {formatDate(timestamp)}
                </span>
              </div>
            </div>
          </div>
        );

      case "settlement":
        const isOutgoing = data.fromUserId._id === session?.user?.id;
        return (
          <div className="flex items-start gap-3">
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                isOutgoing ? "bg-coral/20" : "bg-success/20"
              }`}
            >
              <DollarSign
                className={`h-5 w-5 ${
                  isOutgoing ? "text-coral" : "text-success"
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-900 dark:text-dark-text">
                {isOutgoing
                  ? `You paid ${data.toUserId.name}`
                  : `${data.fromUserId.name} paid you`}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`text-sm font-semibold ${
                    isOutgoing ? "text-coral" : "text-success"
                  }`}
                >
                  {formatCurrency(data.amount)}
                </span>
                <span className="text-xs text-neutral-500">
                  {formatDate(timestamp)}
                </span>
              </div>
            </div>
          </div>
        );

      case "friend_request":
        const isReceived = data.friendId._id === session?.user?.id;
        const friendData = isReceived ? data.userId : data.friendId;
        return (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-info/20 flex items-center justify-center flex-shrink-0">
              <UserPlus className="h-5 w-5 text-info" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-900 dark:text-dark-text">
                {isReceived
                  ? `${friendData.name} sent you a friend request`
                  : `You sent ${friendData.name} a friend request`}
              </p>
              <span className="text-xs text-neutral-500">
                {formatDate(timestamp)}
              </span>
            </div>
          </div>
        );

      default:
        return null;
    }
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
        <div>
          <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
            Activity
          </h1>
          <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
            View all your expense and settlement activities
          </p>
        </div>

        <Card>
          <CardContent>
            {activities.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-16 w-16 mx-auto text-neutral-300 mb-4" />
                <p className="text-body text-neutral-500 dark:text-dark-text-secondary">
                  No activity yet
                </p>
                <p className="text-sm text-neutral-400 dark:text-dark-text-tertiary mt-2">
                  Your transaction history will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="py-3 border-b border-neutral-200 dark:border-dark-border last:border-0"
                  >
                    {renderActivity(activity)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
