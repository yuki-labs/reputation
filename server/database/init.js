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

// Valid user tags
const VALID_TAGS = ['buying', 'selling', 'lending', 'borrowing', 'looking'];

async function initializeDatabase() {
  const client = await pool.connect();

  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        bio TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        email_verified BOOLEAN DEFAULT FALSE
      )
    `);

    // Create indexes for users
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

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
