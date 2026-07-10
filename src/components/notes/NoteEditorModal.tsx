"use client";

import React from "react";
import {
  X, Plus, Check, Pin, Bell, Palette, FileText, ListTodo, Sparkles, Loader2
} from "lucide-react";
import type { NoteDraft } from "./types";
import { COLOR_SCHEMES } from "./types";

interface NoteEditorModalProps {
  isOpen: boolean;
  editingId: string | null;
  draft: NoteDraft;
  onDraftChange: React.Dispatch<React.SetStateAction<NoteDraft>>;
  onClose: () => void;
  onSave: () => void;
  showColorPicker: boolean;
  onToggleColorPicker: () => void;
  showReminderPicker: boolean;
  onToggleReminderPicker: () => void;
  onAddChecklistItem: (index?: number) => void;
  onUpdateDraftItem: (index: number, val: string) => void;
  onToggleDraftItem: (index: number) => void;
  onRemoveDraftItem: (index: number) => void;
}

export default function NoteEditorModal({
  isOpen,
  editingId,
  draft,
  onDraftChange,
  onClose,
  onSave,
  showColorPicker,
  onToggleColorPicker,
  showReminderPicker,
  onToggleReminderPicker,
  onAddChecklistItem,
  onUpdateDraftItem,
  onToggleDraftItem,
  onRemoveDraftItem,
}: NoteEditorModalProps) {
  const [showAiMenu, setShowAiMenu] = React.useState(false);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [customPromptText, setCustomPromptText] = React.useState("");

  const handleAiAction = async (action: string) => {
    try {
      setAiLoading(true);
      setShowAiMenu(false);
      const res = await fetch("/api/ai/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: draft,
          action,
          customPrompt: action === "custom" ? customPromptText : undefined
        })
      });
      const data = await res.json();
      if (data.data) {
        onDraftChange(prev => ({
          ...prev,
          title: data.data.title || prev.title,
          type: data.data.type || prev.type,
          text: data.data.text || prev.text,
          items: data.data.items || prev.items
        }));
        if (action === "custom") {
          setCustomPromptText("");
        }
      } else {
        alert(data.error || "AI failed to process note.");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred calling the AI notes assistant.");
    } finally {
      setAiLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-dark-bg-secondary w-[95vw] max-w-5xl h-[92vh] rounded-2xl flex flex-col shadow-2xl animate-scale-in">
        {/* Modal Header */}
        <div className="p-4 border-b border-neutral-100 dark:border-dark-border flex items-center justify-between">
          <input
            type="text"
            placeholder="Title"
            value={draft.title}
            onChange={e => onDraftChange(prev => ({ ...prev, title: e.target.value }))}
            className="flex-1 font-display font-bold text-lg focus:outline-none bg-transparent text-neutral-900 dark:text-dark-text"
          />
          <button
            onClick={() => onDraftChange(prev => ({ ...prev, pinned: !prev.pinned }))}
            className={`p-2 rounded-lg transition-colors ${
              draft.pinned ? "text-primary" : "text-neutral-400 hover:text-neutral-600 dark:hover:text-dark-text"
            }`}
            title="Pin Note"
          >
            <Pin className="h-5 w-5 fill-current" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto min-h-64">
          <div className="flex gap-2 mb-4 bg-neutral-100 dark:bg-dark-bg-tertiary p-1 rounded-xl w-fit">
            <button
              onClick={() => onDraftChange(prev => ({ ...prev, type: "list" }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                draft.type === "list"
                  ? "bg-white dark:bg-dark-bg-secondary text-primary shadow-sm"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              <ListTodo className="h-3.5 w-3.5" />
              <span>List</span>
            </button>
            <button
              onClick={() => onDraftChange(prev => ({ ...prev, type: "text" }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                draft.type === "text"
                  ? "bg-white dark:bg-dark-bg-secondary text-primary shadow-sm"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Note</span>
            </button>
          </div>

          {draft.type === "text" ? (
            <textarea
              placeholder="Start writing..."
              value={draft.text}
              onChange={e => onDraftChange(prev => ({ ...prev, text: e.target.value }))}
              className="w-full min-h-[280px] focus:outline-none bg-transparent resize-y text-sm text-neutral-800 dark:text-dark-text leading-relaxed"
            />
          ) : (
            <div className="space-y-2">
              <ul className="space-y-2">
                {draft.items.map((item, index) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <button
                      onClick={() => onToggleDraftItem(index)}
                      className={`h-4 w-4 shrink-0 rounded-md border flex items-center justify-center transition-all ${
                        item.done
                          ? "bg-primary border-primary text-white"
                          : "border-neutral-300 dark:border-neutral-700"
                      }`}
                    >
                      {item.done && <Check className="h-3 w-3" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        placeholder="List item"
                        value={item.text}
                        onChange={e => onUpdateDraftItem(index, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onAddChecklistItem(index + 1);
                          }
                        }}
                        className={`w-full py-0.5 focus:outline-none bg-transparent text-sm ${
                          item.done ? "text-neutral-400 dark:text-dark-text-tertiary line-through" : "text-neutral-800 dark:text-dark-text-secondary"
                        }`}
                      />
                    </div>
                    <button
                      onClick={() => onRemoveDraftItem(index)}
                      className="text-neutral-400 hover:text-red-500 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onAddChecklistItem()}
                className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-primary font-bold py-1 px-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Item</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-neutral-50 dark:bg-dark-bg-tertiary border-t border-neutral-100 dark:border-dark-border flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 relative">
            {/* Color Button */}
            <div className="relative">
              <button
                onClick={onToggleColorPicker}
                className={`p-2 rounded-lg transition-colors hover:bg-neutral-200 dark:hover:bg-dark-bg-secondary ${
                  draft.color ? "text-primary" : "text-neutral-500"
                }`}
                title="Change Color"
              >
                <Palette className="h-[18px] w-[18px]" />
              </button>
              {showColorPicker && (
                <div className="absolute bottom-12 left-0 bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-xl p-2 shadow-2xl flex gap-1.5 z-50">
                  <button
                    onClick={() => { onDraftChange(prev => ({ ...prev, color: "" })); onToggleColorPicker(); }}
                    className={`h-7 w-7 rounded-lg border flex items-center justify-center ${!draft.color ? "border-primary" : "border-neutral-200"}`}
                  >
                    <X className="h-3.5 w-3.5 text-neutral-400" />
                  </button>
                  {Object.keys(COLOR_SCHEMES).map(cKey => (
                    <button
                      key={cKey}
                      onClick={() => { onDraftChange(prev => ({ ...prev, color: cKey })); onToggleColorPicker(); }}
                      className={`h-7 w-7 rounded-lg border-2 ${draft.color === cKey ? "border-primary" : "border-transparent"}`}
                      style={{ backgroundColor: COLOR_SCHEMES[cKey].accent }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Reminder Button */}
            <div className="relative">
              <button
                onClick={onToggleReminderPicker}
                className={`p-2 rounded-lg transition-colors hover:bg-neutral-200 dark:hover:bg-dark-bg-secondary ${
                  draft.reminder ? "text-primary" : "text-neutral-500"
                }`}
                title="Set Reminder"
              >
                <Bell className="h-[18px] w-[18px]" />
              </button>
              {showReminderPicker && (
                <div className="absolute bottom-12 left-0 bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-xl p-3 shadow-2xl z-50 w-60">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Set Date & Time</label>
                  <input
                    type="datetime-local"
                    value={draft.reminder ? draft.reminder.slice(0, 16) : ""}
                    onChange={e => onDraftChange(prev => ({ ...prev, reminder: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                    className="w-full px-2 py-1 bg-neutral-100 dark:bg-dark-bg-tertiary border border-neutral-200 dark:border-dark-border rounded-lg text-xs focus:outline-none mb-3 text-neutral-800 dark:text-dark-text"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { onDraftChange(prev => ({ ...prev, reminder: null })); onToggleReminderPicker(); }}
                      className="flex-1 py-1 text-center bg-neutral-100 hover:bg-neutral-200 text-neutral-500 font-bold rounded-lg text-[10px]"
                    >
                      Clear
                    </button>
                    <button
                      onClick={onToggleReminderPicker}
                      className="flex-1 py-1 text-center bg-primary hover:bg-primary-dark text-white font-bold rounded-lg text-[10px]"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* AI Assistant Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowAiMenu(!showAiMenu);
                  if (showColorPicker) onToggleColorPicker();
                  if (showReminderPicker) onToggleReminderPicker();
                }}
                disabled={aiLoading}
                className={`p-2 rounded-lg transition-colors hover:bg-neutral-200 dark:hover:bg-dark-bg-secondary ${
                  showAiMenu ? "text-primary bg-primary/10" : "text-neutral-500"
                }`}
                title="AI Assistant"
              >
                {aiLoading ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin text-primary" />
                ) : (
                  <Sparkles className="h-[18px] w-[18px] text-primary" />
                )}
              </button>
              {showAiMenu && (
                <div className="absolute bottom-12 left-0 bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-xl p-3 shadow-2xl z-50 w-72 flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">AI Note Assistant</span>
                  <button
                    type="button"
                    onClick={() => handleAiAction("summarize")}
                    className="w-full text-left px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary rounded-lg text-xs font-medium text-neutral-700 dark:text-dark-text"
                  >
                    📝 Summarize Note
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAiAction("checklist")}
                    className="w-full text-left px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary rounded-lg text-xs font-medium text-neutral-700 dark:text-dark-text"
                  >
                    ✅ Convert to Checklist
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAiAction("grammar")}
                    className="w-full text-left px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary rounded-lg text-xs font-medium text-neutral-700 dark:text-dark-text"
                  >
                    ✍️ Fix Spelling & Grammar
                  </button>
                  <div className="border-t border-neutral-100 dark:border-dark-border my-1" />
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Ask AI to change note..."
                      value={customPromptText}
                      onChange={e => setCustomPromptText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && customPromptText.trim()) {
                          e.preventDefault();
                          handleAiAction("custom");
                        }
                      }}
                      className="flex-1 px-2.5 py-1.5 bg-neutral-100 dark:bg-dark-bg-tertiary border border-neutral-200 dark:border-dark-border rounded-lg text-xs focus:outline-none text-neutral-800 dark:text-dark-text"
                    />
                    <button
                      type="button"
                      onClick={() => handleAiAction("custom")}
                      disabled={!customPromptText.trim()}
                      className="px-3 py-1.5 bg-primary hover:bg-primary-dark disabled:bg-neutral-300 disabled:dark:bg-neutral-700 text-white rounded-lg text-xs font-bold transition-all"
                    >
                      Go
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="py-1.5 px-4 rounded-xl text-neutral-500 hover:bg-neutral-200 dark:hover:bg-dark-bg-secondary font-bold text-xs"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              className="py-1.5 px-5 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl text-xs shadow-sm active:scale-[0.98]"
            >
              Save Note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
