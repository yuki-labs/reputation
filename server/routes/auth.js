const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database/init');
const { authenticateToken, generateToken } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 12;

// Validation helpers
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validateUsername(username) {
    // 3-30 chars, alphanumeric and underscores only
    const re = /^[a-zA-Z0-9_]{3,30}$/;
    return re.test(username);
}

function validatePassword(password) {
    // At least 8 chars, 1 uppercase, 1 lowercase, 1 number
    return password.length >= 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[0-9]/.test(password);
}

// Register
router.post('/register', async (req, res, next) => {
    try {
        const { username, email, password, displayName } = req.body;

        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        if (!validateUsername(username)) {
            return res.status(400).json({
                error: 'Username must be 3-30 characters, alphanumeric and underscores only'
            });
        }

        if (!validateEmail(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        if (!validatePassword(password)) {
            return res.status(400).json({
                error: 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number'
            });
        }

        const db = getDatabase();

        // Check for existing user
        const existingUser = db.prepare(
            'SELECT id FROM users WHERE username = ? OR email = ?'
        ).get(username.toLowerCase(), email.toLowerCase());

        if (existingUser) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Create user
        const userId = uuidv4();
        db.prepare(`
      INSERT INTO users (id, username, email, password_hash, display_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, username.toLowerCase(), email.toLowerCase(), passwordHash, displayName || username);

        // Generate token
        const token = generateToken(userId);

        // Set cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.status(201).json({
            message: 'Account created successfully',
            user: {
                id: userId,
                username: username.toLowerCase(),
                email: email.toLowerCase(),
                displayName: displayName || username
            }
        });
    } catch (error) {
        next(error);
    }
});

// Login
router.post('/login', async (req, res, next) => {
    try {
        const { login, password } = req.body;

        if (!login || !password) {
            return res.status(400).json({ error: 'Login and password are required' });
        }

        const db = getDatabase();

        // Find user by username or email
        const user = db.prepare(`
      SELECT id, username, email, password_hash, display_name, avatar_url, is_active
      FROM users 
      WHERE username = ? OR email = ?
    `).get(login.toLowerCase(), login.toLowerCase());

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.is_active) {
            return res.status(403).json({ error: 'Account is deactivated' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate token
        const token = generateToken(user.id);

        // Set cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                displayName: user.display_name,
                avatarUrl: user.avatar_url
            }
        });
    } catch (error) {
        next(error);
    }
});

// Logout
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
});

// Get current user
router.get('/me', authenticateToken, (req, res) => {
    const db = getDatabase();
    const user = db.prepare(`
    SELECT id, username, email, display_name, avatar_url, bio, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        bio: user.bio,
        createdAt: user.created_at
    });
});

// Update profile
router.patch('/me', authenticateToken, async (req, res, next) => {
    try {
        const { displayName, bio } = req.body;
        const db = getDatabase();

        db.prepare(`
      UPDATE users 
      SET display_name = COALESCE(?, display_name),
          bio = COALESCE(?, bio),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(displayName, bio, req.user.id);

        res.json({ message: 'Profile updated' });
    } catch (error) {
        next(error);
    }
});

// Change password
router.post('/change-password', authenticateToken, async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required' });
        }

        if (!validatePassword(newPassword)) {
            return res.status(400).json({
                error: 'New password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number'
            });
        }

        const db = getDatabase();
        const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);

        const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
            .run(newPasswordHash, req.user.id);

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
