"use client";

import Link from "next/link";
import BrandLogo from "@/components/ui/BrandLogo";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-cream dark:bg-dark-bg py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <Link href="/">
            <BrandLogo size={48} className="h-12 w-12 rounded-xl inline-block mb-4" />
          </Link>
          <h1 className="text-h1 font-bold font-display text-neutral-900 dark:text-dark-text">
            Terms of Service
          </h1>
          <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-2">
            Last updated: April 2026
          </p>
        </div>

        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-neutral-200 dark:border-dark-border p-8 space-y-8 text-body text-neutral-700 dark:text-dark-text-secondary leading-relaxed">
          <section>
            <h2 className="text-h3 font-semibold text-neutral-900 dark:text-dark-text mb-3">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using DooSplit, you agree to be bound by these Terms of Service. If
              you do not agree to these terms, please do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-h3 font-semibold text-neutral-900 dark:text-dark-text mb-3">
              2. Use of Service
            </h2>
            <p>
              DooSplit provides expense-splitting and group finance management tools. You agree to
              use the service only for lawful purposes and in accordance with these terms. You are
              responsible for maintaining the security of your account credentials.
            </p>
          </section>

          <section>
            <h2 className="text-h3 font-semibold text-neutral-900 dark:text-dark-text mb-3">
              3. User Accounts
            </h2>
            <p>
              You must provide accurate information when creating an account. You are responsible for
              all activity that occurs under your account. Notify us immediately of any unauthorized
              access.
            </p>
          </section>

          <section>
            <h2 className="text-h3 font-semibold text-neutral-900 dark:text-dark-text mb-3">
              4. Data and Privacy
            </h2>
            <p>
              Your use of DooSplit is also governed by our{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
              , which is incorporated into these terms by reference.
            </p>
          </section>

          <section>
            <h2 className="text-h3 font-semibold text-neutral-900 dark:text-dark-text mb-3">
              5. Limitation of Liability
            </h2>
            <p>
              DooSplit is provided &quot;as is&quot; without warranties of any kind. We are not liable for
              any indirect, incidental, or consequential damages arising from your use of the
              service.
            </p>
          </section>

          <section>
            <h2 className="text-h3 font-semibold text-neutral-900 dark:text-dark-text mb-3">
              6. Changes to Terms
            </h2>
            <p>
              We reserve the right to update these terms at any time. Continued use of the service
              after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-h3 font-semibold text-neutral-900 dark:text-dark-text mb-3">
              7. Contact
            </h2>
            <p>
              For questions about these terms, please contact us through the app&apos;s feedback feature.
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
