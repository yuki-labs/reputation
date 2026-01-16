const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// PostgreSQL connection - uses DATABASE_URL from Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Storage path for uploads
const STORAGE_DIR = process.env.STORAGE_PATH || path.join(__dirname, '../../uploads');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Valid user tags (main tags + sub-tags)
const VALID_TAGS = ['buying', 'selling', 'lending', 'borrowing', 'looking', 'nudes', 'sexting', 'irl_gfe'];

async function initializeDatabase() {
  const client = await pool.connect();

  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        display_name TEXT,
        avatar_url TEXT,
        bio TEXT,
        oauth_provider TEXT,
        oauth_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        email_verified BOOLEAN DEFAULT FALSE
      )
    `);

    // Add OAuth columns if they don't exist (for existing databases)
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='oauth_provider') THEN
          ALTER TABLE users ADD COLUMN oauth_provider TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='oauth_id') THEN
          ALTER TABLE users ADD COLUMN oauth_id TEXT;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password_hash' AND is_nullable='NO') THEN
          ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
        END IF;
      END $$;
    `);

    // Create indexes for users
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id)`);

    // Add onboarding_complete column if it doesn't exist
    try {
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE`);
      console.log('Onboarding column ensured');
    } catch (err) {
      console.log('Onboarding column already exists or migration skipped');
    }

    // User tags table (many-to-many relationship)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_tags (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, tag)
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_tags_user_id ON user_tags(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_tags_tag ON user_tags(tag)`);

    // Images table
    await client.query(`
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        thumbnail_filename TEXT,
        title TEXT,
        description TEXT,
        is_public BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for images
    await client.query(`CREATE INDEX IF NOT EXISTS idx_images_user_id ON images(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_images_is_public ON images(is_public)`);

    // Sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_agent TEXT,
        ip_address TEXT
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`);

    // Conversations table (for DMs between two users)
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user1_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user2_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user1_id, user2_id)
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversations_user1 ON conversations(user1_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON conversations(user2_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC)`);

    // Messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT,
        attachment_url TEXT,
        attachment_type TEXT,
        attachment_name TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`);

    // Migrations: Add attachment columns to messages table if they don't exist
    try {
      await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT`);
      await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type TEXT`);
      await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name TEXT`);
      console.log('Message attachment columns ensured');
    } catch (err) {
      // Columns might already exist, ignore errors
      console.log('Attachment columns already exist or migration skipped');
    }

    // Migration: Make content column nullable (for attachment-only messages)
    try {
      await client.query(`ALTER TABLE messages ALTER COLUMN content DROP NOT NULL`);
    } catch (err) {
      // Already nullable, ignore
    }

    // Migration: Add edited_at column to messages
    try {
      await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP`);
      await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE`);
      console.log('Message edit columns ensured');
    } catch (err) {
      console.log('Edit columns already exist or migration skipped');
    }

    // Message edits history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_edits (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        previous_content TEXT,
        edited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_message_edits_message_id ON message_edits(message_id)`);

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

function getPool() {
  return pool;
}

function getStoragePath() {
  return STORAGE_DIR;
}

function getValidTags() {
  return VALID_TAGS;
}

module.exports = { getPool, initializeDatabase, getStoragePath, getValidTags };
