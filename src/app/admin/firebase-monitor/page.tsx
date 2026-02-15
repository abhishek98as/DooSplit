'use client';

import { useEffect, useState } from 'react';

export default function FirebaseMonitor() {
  const [stats, setStats] = useState<any>(null);
  const [usage, setUsage] = useState({ reads: 0, writes: 0, deletes: 0 });

  useEffect(() => {
    // Fetch account details
    fetch('/api/firebase/account')
      .then(r => r.json())
      .then(setStats)
      .catch(console.error);

    // Note: Actual usage tracking requires Firebase Admin SDK
    // or Google Cloud Monitoring API (not available in Spark plan)
    // This is a placeholder for future implementation
  }, []);

  const calculateProjections = () => {
    const dailyReads = usage.reads;
    const dailyWrites = usage.writes;

    return {
      readsRemaining: 50000 - dailyReads,
      writesRemaining: 20000 - dailyWrites,
      readsPercent: parseFloat((dailyReads > 0 ? (dailyReads / 50000 * 100).toFixed(1) : '0')),
      writesPercent: parseFloat((dailyWrites > 0 ? (dailyWrites / 20000 * 100).toFixed(1) : '0')),
    };
  };

  const projections = calculateProjections();

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Firebase Spark Plan Monitor
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Monitor your Firebase usage against Spark plan limits
        </p>
      </div>

      {/* Account Details */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
          Account Information
        </h2>
        {stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Project ID</p>
              <p className="font-mono text-gray-900 dark:text-white">{stats.project?.id || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Display Name</p>
              <p className="text-gray-900 dark:text-white">{stats.project?.displayName || 'DooSplit'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Plan</p>
              <p className="text-green-600 font-semibold">{stats.firestore?.plan || 'Spark (Free)'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Users Count</p>
              <p className="text-gray-900 dark:text-white">{stats.auth?.usersCount || 0}</p>
            </div>
          </div>
        ) : (
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-2"></div>
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        )}
      </div>

      {/* Usage Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Daily Read Quota */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Daily Read Quota</h3>
            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
              Spark Plan
            </span>
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
              <span>Used</span>
              <span>{usage.reads.toLocaleString()} / 50,000</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  projections.readsPercent > 80 ? 'bg-red-500' :
                  projections.readsPercent > 60 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(projections.readsPercent, 100)}%` }}
              ></div>
            </div>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>{projections.readsPercent}% used today</p>
            <p>{projections.readsRemaining.toLocaleString()} reads remaining</p>
          </div>
        </div>

        {/* Daily Write Quota */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Daily Write Quota</h3>
            <span className="px-2 py-1 text-xs rounded-full bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
              Spark Plan
            </span>
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
              <span>Used</span>
              <span>{usage.writes.toLocaleString()} / 20,000</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  projections.writesPercent > 80 ? 'bg-red-500' :
                  projections.writesPercent > 60 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(projections.writesPercent, 100)}%` }}
              ></div>
            </div>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>{projections.writesPercent}% used today</p>
            <p>{projections.writesRemaining.toLocaleString()} writes remaining</p>
          </div>
        </div>
      </div>

      {/* Spark Plan Limits Reference */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Firebase Spark Plan Limits
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">Database</h4>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• 1 GiB stored data</li>
              <li>• 50K document reads/day</li>
              <li>• 20K document writes/day</li>
              <li>• 20K document deletes/day</li>
              <li>• 10 GiB network egress/month</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">Authentication</h4>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Email verification: 1,000/day</li>
              <li>• Password reset: 150/day</li>
              <li>• Email sign-in links: 20,000/day</li>
              <li>• SMS: Requires Blaze plan</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>Note:</strong> Cloud Storage legacy buckets become inaccessible February 3, 2026 unless you upgrade to Blaze plan.
          </p>
        </div>
      </div>

      {/* Usage Warnings */}
      {(projections.readsPercent > 80 || projections.writesPercent > 80) && (
        <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                High Usage Alert
              </h3>
              <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                {projections.readsPercent > 80 && (
                  <p>• Read usage is over 80% ({projections.readsPercent}%)</p>
                )}
                {projections.writesPercent > 80 && (
                  <p>• Write usage is over 80% ({projections.writesPercent}%)</p>
                )}
                <p className="mt-2">Consider optimizing queries or upgrading to Blaze plan for higher limits.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Raw Stats */}
      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
          Raw Firebase Account Data
        </summary>
        <div className="mt-2 p-4 bg-gray-50 dark:bg-gray-900 rounded border">
          <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-auto">
            {JSON.stringify(stats, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
}