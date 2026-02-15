"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth/react-session";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, ArrowLeft } from "lucide-react";

interface Conflict {
  id: string;
  entityType: string;
  entityId: string;
  field: string;
  serverValue: any;
  clientValue: any;
  lastModified: string;
}

interface ConflictGroup {
  entityId: string;
  entityType: string;
  conflicts: Conflict[];
}

export default function ConflictsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [conflicts, setConflicts] = useState<ConflictGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user?.id) {
      router.push("/auth/login");
      return;
    }

    fetchConflicts();
  }, [session, status, router]);

  const fetchConflicts = async () => {
    try {
      const res = await fetch("/api/conflicts");
      if (res.ok) {
        const data = await res.json();
        setConflicts(data.conflicts || []);
      }
    } catch (error) {
      console.error("Failed to fetch conflicts:", error);
    } finally {
      setLoading(false);
    }
  };

  const resolveConflict = async (conflictId: string, resolution: 'server-wins' | 'client-wins' | 'merge') => {
    setResolving(conflictId);
    try {
      const res = await fetch(`/api/conflicts/${conflictId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution })
      });

      if (res.ok) {
        // Remove resolved conflict from list
        setConflicts(prev => prev.filter(group =>
          !group.conflicts.some(c => c.id === conflictId)
        ).filter(group => group.conflicts.length > 0));
      }
    } catch (error) {
      console.error("Failed to resolve conflict:", error);
    } finally {
      setResolving(null);
    }
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return "None";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  };

  const getConflictIcon = (field: string) => {
    return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  };

  if (status === "loading" || loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-screen">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
              Data Conflicts
            </h1>
            <p className="text-body text-neutral-600 dark:text-dark-text-secondary mt-1">
              Resolve conflicts that occurred during synchronization
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => router.back()}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        {conflicts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-dark-text mb-2">
                No Conflicts Found
              </h3>
              <p className="text-neutral-600 dark:text-dark-text-secondary text-center">
                All your data is synchronized. There are no conflicts to resolve.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {conflicts.map((group) => (
              <Card key={group.entityId}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {getConflictIcon("general")}
                    {group.entityType.charAt(0).toUpperCase() + group.entityType.slice(1)} Conflict
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {group.conflicts.map((conflict) => (
                    <div key={conflict.id} className="border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 bg-yellow-50 dark:bg-yellow-900/20">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-dark-text">
                            {conflict.field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                          </h4>
                          <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">
                            Last modified: {new Date(conflict.lastModified).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4 mb-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500" />
                            <span className="font-medium text-red-700 dark:text-red-400">Server Version</span>
                          </div>
                          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                            <pre className="text-sm text-red-800 dark:text-red-200 whitespace-pre-wrap font-mono">
                              {formatValue(conflict.serverValue)}
                            </pre>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="font-medium text-green-700 dark:text-green-400">Your Version</span>
                          </div>
                          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3">
                            <pre className="text-sm text-green-800 dark:text-green-200 whitespace-pre-wrap font-mono">
                              {formatValue(conflict.clientValue)}
                            </pre>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resolveConflict(conflict.id, 'server-wins')}
                          disabled={resolving === conflict.id}
                          className="flex items-center gap-1"
                        >
                          {resolving === conflict.id ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          Use Server
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resolveConflict(conflict.id, 'client-wins')}
                          disabled={resolving === conflict.id}
                          className="flex items-center gap-1"
                        >
                          {resolving === conflict.id ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3 w-3" />
                          )}
                          Use Mine
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resolveConflict(conflict.id, 'merge')}
                          disabled={resolving === conflict.id || !canMerge(conflict)}
                          className="flex items-center gap-1"
                        >
                          {resolving === conflict.id ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Merge
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function canMerge(conflict: Conflict): boolean {
  // Simple merge logic - can merge if both values are objects or arrays
  return (typeof conflict.serverValue === 'object' && typeof conflict.clientValue === 'object') ||
         (Array.isArray(conflict.serverValue) && Array.isArray(conflict.clientValue));
}
