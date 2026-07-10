"use client";

import React from "react";
import { Loader2, Plus, Settings } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { useNotes } from "@/components/notes/useNotes";
import NoteCard from "@/components/notes/NoteCard";
import NoteEditorModal from "@/components/notes/NoteEditorModal";
import NotesFilterBar from "@/components/notes/NotesFilterBar";
import NotesSettingsModal from "@/components/notes/NotesSettingsModal";
import NotesToast from "@/components/notes/NotesToast";
import NotesEmptyState from "@/components/notes/NotesEmptyState";

export default function NotesPage() {
  const notes = useNotes();

  if (notes.loading) {
    return (
      <AppShell>
        <div className="flex h-[60vh] w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="min-h-[calc(100vh-140px)] w-full relative px-4 py-4 flex flex-col gap-4">
        {/* ── Header Row ──────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary">
            {notes.filteredNotes.length} {notes.filteredNotes.length === 1 ? "note" : "notes"} · Keep track of lists, reminders & quick thoughts
          </p>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => notes.openEditor()}
              className="py-2.5 px-4 bg-primary hover:bg-primary-dark text-white font-display font-semibold rounded-xl flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all text-xs"
            >
              <Plus className="h-4 w-4" />
              <span>New Note</span>
            </button>
            <button
              onClick={() => notes.setSettingsOpen(true)}
              className="p-2 border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-600 dark:text-dark-text-secondary hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary rounded-xl transition-colors"
              title="Notes Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Filter Bar (compact underline tabs + label chips) ────────────────── */}
        <NotesFilterBar
          currentView={notes.currentView}
          onViewChange={notes.setCurrentView}
          currentLabel={notes.currentLabel}
          onLabelChange={notes.setCurrentLabel}
          searchQuery={notes.searchQuery}
          onSearchChange={notes.setSearchQuery}
          sortBy={notes.sortBy}
          onSortChange={notes.setSortBy}
          counts={notes.counts}
          onEmptyTrash={notes.emptyTrash}
        />

        {/* ── Notes Grid ──────────────────────────── */}
        <div className="flex-1 min-w-0">
          {notes.filteredNotes.length === 0 ? (
            <NotesEmptyState searchQuery={notes.searchQuery} />
          ) : (
            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
              {notes.filteredNotes.map(note => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onTogglePin={notes.togglePin}
                  onToggleArchive={notes.toggleArchive}
                  onDelete={notes.deleteNote}
                  onToggleItemDone={notes.toggleCardItemDone}
                  onClick={notes.openEditor}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile Floating Add Button ──────────────────────────── */}
      <button
        onClick={() => notes.openEditor()}
        className="fixed bottom-24 right-4 h-14 w-14 bg-primary text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-transform z-30 md:hidden"
        aria-label="Add Note"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* ── Toast ──────────────────────────── */}
      <NotesToast toast={notes.toast} onDismiss={() => notes.setToast(null)} />

      {/* ── Editor Modal ──────────────────────────── */}
      <NoteEditorModal
        isOpen={notes.modalOpen}
        editingId={notes.editingId}
        draft={notes.draft}
        onDraftChange={notes.setDraft}
        onClose={() => { notes.setModalOpen(false); }}
        onSave={notes.saveNote}
        showColorPicker={notes.showColorPicker}
        onToggleColorPicker={() => { notes.setShowColorPicker(!notes.showColorPicker); notes.setShowReminderPicker(false); }}
        showReminderPicker={notes.showReminderPicker}
        onToggleReminderPicker={() => { notes.setShowReminderPicker(!notes.showReminderPicker); notes.setShowColorPicker(false); }}
        onAddChecklistItem={notes.addChecklistItem}
        onUpdateDraftItem={notes.updateDraftItem}
        onToggleDraftItem={notes.toggleDraftItem}
        onRemoveDraftItem={notes.removeDraftItem}
      />

      {/* ── Settings Modal ──────────────────────────── */}
      <NotesSettingsModal
        isOpen={notes.settingsOpen}
        onClose={() => notes.setSettingsOpen(false)}
        onExport={notes.exportNotes}
        onEmptyTrash={notes.emptyTrash}
      />
    </AppShell>
  );
}
