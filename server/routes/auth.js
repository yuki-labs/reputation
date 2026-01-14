const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../database/init');
const { authenticateToken, generateToken } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 12;

// Validation helpers
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validateUsername(username) {
    const re = /^[a-zA-Z0-9_]{3,30}$/;
    return re.test(username);
}

function validatePassword(password) {
    return password.length >= 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[0-9]/.test(password);
}

// Register
router.post('/register', async (req, res, next) => {
    try {
        const { username, email, password, displayName } = req.body;

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

        const pool = getPool();

        // Check for existing user
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username.toLowerCase(), email.toLowerCase()]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Create user
        const userId = uuidv4();
        await pool.query(
            `INSERT INTO users (id, username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4, $5)`,
            [userId, username.toLowerCase(), email.toLowerCase(), passwordHash, displayName || username]
        );

        // Generate token
        const token = generateToken(userId);

        // Set cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
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

        const pool = getPool();

        const result = await pool.query(
            `SELECT id, username, email, password_hash, display_name, avatar_url, is_active
       FROM users 
       WHERE username = $1 OR email = $1`,
            [login.toLowerCase()]
        );

        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.is_active) {
            return res.status(403).json({ error: 'Account is deactivated' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = generateToken(user.id);

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
router.get('/me', authenticateToken, async (req, res, next) => {
    try {
        const pool = getPool();
        const result = await pool.query(
            `SELECT id, username, email, display_name, avatar_url, bio, created_at
       FROM users WHERE id = $1`,
            [req.user.id]
        );

        const user = result.rows[0];

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
    } catch (error) {
        next(error);
    }
});

// Update profile
router.patch('/me', authenticateToken, async (req, res, next) => {
    try {
        const { displayName, bio } = req.body;
        const pool = getPool();

        await pool.query(
            `UPDATE users 
       SET display_name = COALESCE($1, display_name),
           bio = COALESCE($2, bio),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
            [displayName, bio, req.user.id]
        );

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

        const pool = getPool();
        const result = await pool.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.user.id]
        );

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(currentPassword, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await pool.query(
            'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newPasswordHash, req.user.id]
        );

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
