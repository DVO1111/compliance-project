-- ═══════════════════════════════════════════════════════════════
--  Team Chat — Database Schema
--  Tables: chat_channels, chat_channel_members, chat_messages,
--          chat_reactions, chat_mentions, chat_relay_destinations
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Channels ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_channels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  channel_type  TEXT NOT NULL DEFAULT 'custom'
                CHECK (channel_type IN ('general','announcements','custom')),
  created_by    UUID REFERENCES auth.users(id),
  is_archived   BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE INDEX idx_chat_channels_company ON chat_channels(company_id);

-- ── 2. Channel Members (+ read receipts) ─────────────────────
CREATE TABLE IF NOT EXISTS chat_channel_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id    UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at  TIMESTAMPTZ DEFAULT now(),
  joined_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (channel_id, user_id)
);

CREATE INDEX idx_chat_members_channel ON chat_channel_members(channel_id);
CREATE INDEX idx_chat_members_user    ON chat_channel_members(user_id);

-- ── 3. Messages ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id    UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  sender_id     UUID NOT NULL REFERENCES auth.users(id),
  parent_id     UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  content       TEXT NOT NULL DEFAULT '',
  content_type  TEXT NOT NULL DEFAULT 'text'
                CHECK (content_type IN ('text','gif','system')),
  gif_url       TEXT,
  is_pinned     BOOLEAN DEFAULT FALSE,
  is_edited     BOOLEAN DEFAULT FALSE,
  is_deleted    BOOLEAN DEFAULT FALSE,
  relay_sent    BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_messages_channel   ON chat_messages(channel_id, created_at DESC);
CREATE INDEX idx_chat_messages_parent    ON chat_messages(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_chat_messages_search    ON chat_messages USING gin(to_tsvector('english', content));

-- ── 4. Reactions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX idx_chat_reactions_message ON chat_reactions(message_id);

-- ── 5. Mentions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_mentions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_mentions_user ON chat_mentions(user_id);

-- ── 6. Relay Destinations (external channels) ────────────────
CREATE TABLE IF NOT EXISTS chat_relay_destinations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id   UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL DEFAULT 'slack'
                  CHECK (provider IN ('slack','teams','discord')),
  external_id     TEXT NOT NULL,
  external_name   TEXT NOT NULL,
  is_private      BOOLEAN DEFAULT FALSE,
  synced_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, provider, external_id)
);

CREATE INDEX idx_relay_dest_company ON chat_relay_destinations(company_id);

-- ═══════════════════════════════════════════════════════════════
--  RLS Policies — company-scoped access
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE chat_channels           ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_channel_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_reactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_mentions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_relay_destinations ENABLE ROW LEVEL SECURITY;

-- Channels: users can see channels in their company
CREATE POLICY chat_channels_select ON chat_channels FOR SELECT USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY chat_channels_insert ON chat_channels FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY chat_channels_update ON chat_channels FOR UPDATE USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- Channel members: users can manage their own membership
CREATE POLICY chat_members_select ON chat_channel_members FOR SELECT USING (
  channel_id IN (SELECT id FROM chat_channels WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
);
CREATE POLICY chat_members_insert ON chat_channel_members FOR INSERT WITH CHECK (
  channel_id IN (SELECT id FROM chat_channels WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
);
CREATE POLICY chat_members_update ON chat_channel_members FOR UPDATE USING (
  user_id = auth.uid()
);
CREATE POLICY chat_members_delete ON chat_channel_members FOR DELETE USING (
  user_id = auth.uid()
);

-- Messages: users can see messages in channels they belong to
CREATE POLICY chat_messages_select ON chat_messages FOR SELECT USING (
  channel_id IN (SELECT id FROM chat_channels WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
);
CREATE POLICY chat_messages_insert ON chat_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND
  channel_id IN (SELECT id FROM chat_channels WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
);
CREATE POLICY chat_messages_update ON chat_messages FOR UPDATE USING (
  sender_id = auth.uid()
);
CREATE POLICY chat_messages_delete ON chat_messages FOR DELETE USING (
  sender_id = auth.uid()
);

-- Reactions
CREATE POLICY chat_reactions_select ON chat_reactions FOR SELECT USING (
  message_id IN (SELECT id FROM chat_messages WHERE channel_id IN (SELECT id FROM chat_channels WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())))
);
CREATE POLICY chat_reactions_insert ON chat_reactions FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY chat_reactions_delete ON chat_reactions FOR DELETE USING (
  user_id = auth.uid()
);

-- Mentions
CREATE POLICY chat_mentions_select ON chat_mentions FOR SELECT USING (
  message_id IN (SELECT id FROM chat_messages WHERE channel_id IN (SELECT id FROM chat_channels WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())))
);
CREATE POLICY chat_mentions_insert ON chat_mentions FOR INSERT WITH CHECK (
  TRUE
);

-- Relay destinations
CREATE POLICY relay_dest_select ON chat_relay_destinations FOR SELECT USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY relay_dest_insert ON chat_relay_destinations FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY relay_dest_delete ON chat_relay_destinations FOR DELETE USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- ═══════════════════════════════════════════════════════════════
--  Function: auto-create #general + #announcements for a company
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ensure_default_chat_channels(p_company_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO chat_channels (company_id, name, description, channel_type)
  VALUES
    (p_company_id, 'general', 'Company-wide discussion', 'general'),
    (p_company_id, 'announcements', 'Official announcements (Exec/Admin only)', 'announcements')
  ON CONFLICT (company_id, name) DO NOTHING;
END;
$$;
