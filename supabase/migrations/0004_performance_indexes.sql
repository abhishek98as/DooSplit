-- Performance optimization indexes for Splitwise/DooSplit
-- Run this migration to improve query performance from 60s to <1s load times

-- Optimize expense queries with covering index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_user_lookup
ON expense_participants (user_id, expense_id)
INCLUDE (paid_amount, owed_amount, is_settled);

-- Optimize multi-column expense filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_category_date
ON expenses (category, is_deleted, date DESC, created_at DESC)
WHERE is_deleted = false;

-- Optimize group queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_group_members_group_user
ON group_members (group_id, user_id)
INCLUDE (role, joined_at);

-- Optimize settlement OR queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_settlements_user_activity
ON settlements (from_user_id, to_user_id, created_at DESC);

-- Add GIN index for JSONB queries if needed
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_images_gin
ON expenses USING GIN (images)
WHERE jsonb_array_length(images) > 0;

-- Optimize friendship queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_friendships_user_status_created
ON friendships (user_id, status, created_at DESC);

-- Optimize notifications for user timeline
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_type_created
ON notifications (user_id, type, created_at DESC);