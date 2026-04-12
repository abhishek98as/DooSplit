"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

interface FeedbackWidgetProps {
  /** When provided, the widget is fully controlled — no floating button is rendered */
  isOpen?: boolean;
  onClose?: () => void;
}

export default function FeedbackWidget({ isOpen, onClose }: FeedbackWidgetProps = {}) {
  const pathname = usePathname();
  const controlled = isOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlled ? isOpen : internalOpen;
  const handleClose = controlled ? (onClose ?? (() => {})) : () => setInternalOpen(false);
  const [message, setMessage] = useState("");
  const [type, setType] = useState("missing_feature");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      alert("Please enter your feedback before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          type,
          screen: pathname,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || "Failed to submit feedback");
      }

      setMessage("");
      handleClose();
      alert("Thanks! Your feedback has been submitted.");
    } catch (error: any) {
      console.error("Submit feedback error:", error);
      alert(error?.message || "Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {!controlled && (
        <button
          type="button"
          onClick={() => setInternalOpen(true)}
          className="fixed right-4 bottom-24 md:bottom-6 z-40 rounded-full bg-primary text-white px-4 py-2.5 text-sm font-semibold shadow-lg hover:opacity-95"
        >
          Suggest Feature
        </button>
      )}

      <Modal isOpen={open ?? false} onClose={handleClose} title="Feature Feedback">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
              Feedback Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
            >
              <option value="missing_feature">Missing Feature</option>
              <option value="improvement">Improvement Idea</option>
              <option value="bug_report">Bug Report</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
              What should we improve?
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={1200}
              placeholder="Tell us the missing feature or pain point..."
              className="w-full px-3 py-2 border border-neutral-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
            />
            <p className="mt-1 text-xs text-neutral-500">{message.length}/1200</p>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
