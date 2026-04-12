"use client";

import Link from "next/link";
import BrandLogo from "@/components/ui/BrandLogo";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-cream dark:bg-dark-bg py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <Link href="/">
            <BrandLogo size={48} className="h-12 w-12 rounded-xl inline-block mb-4" />
          </Link>
          <h1 className="text-h1 font-bold font-display text-neutral-900 dark:text-dark-text">
            Privacy Policy
          </h1>
          <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-2">
            Last updated: April 2026
          </p>
        </div>

        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-neutral-200 dark:border-dark-border p-8 space-y-8 text-body text-neutral-700 dark:text-dark-text-secondary leading-relaxed">
          <section>
            <h2 className="text-h3 font-semibold text-neutral-900 dark:text-dark-text mb-3">
              1. Information We Collect
            </h2>
            <p>
              We collect information you provide directly — such as your name, email address, and
              expense data — when you create an account or use the service. We also collect usage
              data and device information to improve the experience.
            </p>
          </section>

          <section>
            <h2 className="text-h3 font-semibold text-neutral-900 dark:text-dark-text mb-3">
              2. How We Use Your Information
            </h2>
            <p>
              Your information is used to provide and improve DooSplit, to communicate with you
              about your account, and to enable expense-sharing features. We do not sell your
              personal data to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-h3 font-semibold text-neutral-900 dark:text-dark-text mb-3">
              3. Data Storage
            </h2>
            <p>
              Your data is stored securely using Firebase (Google Cloud). All data is encrypted in
              transit and at rest. We retain your data for as long as your account is active.
            </p>
          </section>

          <section>
            <h2 className="text-h3 font-semibold text-neutral-900 dark:text-dark-text mb-3">
              4. Sharing of Information
            </h2>
            <p>
              Expense and group data is shared with the friends and group members you explicitly add.
              We do not share your data with unrelated third parties. We use Google Analytics solely
              for product improvement.
            </p>
          </section>

          <section>
            <h2 className="text-h3 font-semibold text-neutral-900 dark:text-dark-text mb-3">
              5. Your Rights
            </h2>
            <p>
              You can delete your account and all associated data at any time from the Settings page.
              You may also request a copy of your data by contacting us through the app&apos;s feedback
              feature.
            </p>
          </section>

          <section>
            <h2 className="text-h3 font-semibold text-neutral-900 dark:text-dark-text mb-3">
              6. Cookies
            </h2>
            <p>
              We use session cookies for authentication and local storage for offline functionality.
              No third-party advertising cookies are used.
            </p>
          </section>

          <section>
            <h2 className="text-h3 font-semibold text-neutral-900 dark:text-dark-text mb-3">
              7. Changes to This Policy
            </h2>
            <p>
              We may update this policy from time to time. We will notify you of significant changes
              via the app. Continued use after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-h3 font-semibold text-neutral-900 dark:text-dark-text mb-3">
              8. Contact
            </h2>
            <p>
              For privacy-related questions, please contact us through the app&apos;s feedback feature.
            </p>
          </section>
        </div>

        <div className="text-center mt-8">
          <Link
            href="/auth/register"
            className="text-primary hover:underline text-body"
          >
            ← Back to Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}
