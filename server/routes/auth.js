const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getPool, getValidTags } = require('../database/init');
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

// Helper to get user tags
async function getUserTags(pool, userId) {
    const result = await pool.query(
        'SELECT tag FROM user_tags WHERE user_id = $1 ORDER BY tag',
        [userId]
    );
    return result.rows.map(row => row.tag);
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

        const existingUser = await pool.query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username.toLowerCase(), email.toLowerCase()]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        const userId = uuidv4();
        await pool.query(
            `INSERT INTO users (id, username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4, $5)`,
            [userId, username.toLowerCase(), email.toLowerCase(), passwordHash, displayName || username]
        );

        const token = generateToken(userId);

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
                displayName: displayName || username,
                tags: [],
                onboardingComplete: false
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
            `SELECT id, username, email, password_hash, display_name, avatar_url, is_active, onboarding_complete
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
        const tags = await getUserTags(pool, user.id);

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
                avatarUrl: user.avatar_url,
                tags,
                onboardingComplete: user.onboarding_complete || false
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
            `SELECT id, username, email, display_name, avatar_url, bio, created_at, oauth_provider, password_hash, onboarding_complete
       FROM users WHERE id = $1`,
            [req.user.id]
        );

        const user = result.rows[0];

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const tags = await getUserTags(pool, user.id);

        res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.display_name,
            avatarUrl: user.avatar_url,
            bio: user.bio,
            createdAt: user.created_at,
            oauthProvider: user.oauth_provider || null,
            hasPassword: !!(user.password_hash && user.password_hash.length > 0),
            tags,
            onboardingComplete: user.onboarding_complete || false
        });
    } catch (error) {
        next(error);
    }
});

// Complete onboarding - set initial tags
router.post('/complete-onboarding', authenticateToken, async (req, res, next) => {
    try {
        const { tags } = req.body;
        const pool = getPool();
        const userId = req.user.id;

        // Validate tags
        const validTags = ['buying', 'selling', 'lending', 'borrowing', 'looking', 'nudes', 'sexting', 'irl_gfe'];
        if (!tags || !Array.isArray(tags) || tags.length === 0) {
            return res.status(400).json({ error: 'Please select at least one tag' });
        }

        const filteredTags = tags.filter(t => validTags.includes(t));
        if (filteredTags.length === 0) {
            return res.status(400).json({ error: 'Please select at least one valid tag' });
        }

        // Delete existing tags and insert new ones
        await pool.query('DELETE FROM user_tags WHERE user_id = $1', [userId]);

        for (const tag of filteredTags) {
            const tagId = require('uuid').v4();
            await pool.query(
                'INSERT INTO user_tags (id, user_id, tag) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                [tagId, userId, tag]
            );
        }

        // Mark onboarding as complete
        await pool.query(
            'UPDATE users SET onboarding_complete = true WHERE id = $1',
            [userId]
        );

        res.json({
            message: 'Onboarding complete',
            tags: filteredTags,
            onboardingComplete: true
        });
    } catch (error) {
        next(error);
    }
});

// Update profile
router.patch('/me', authenticateToken, async (req, res, next) => {
    try {
        const { username, displayName, bio } = req.body;
        const pool = getPool();

        // If username is being changed, validate it
        if (username !== undefined && username !== null) {
            const newUsername = username.toLowerCase().trim();

            // Validate format
            if (!validateUsername(newUsername)) {
                return res.status(400).json({
                    error: 'Username must be 3-30 characters, alphanumeric and underscores only'
                });
            }

            // Check if different from current
            const currentUser = await pool.query(
                'SELECT username FROM users WHERE id = $1',
                [req.user.id]
            );

            if (currentUser.rows[0].username !== newUsername) {
                // Check uniqueness
                const existing = await pool.query(
                    'SELECT id FROM users WHERE username = $1 AND id != $2',
                    [newUsername, req.user.id]
                );

                if (existing.rows.length > 0) {
                    return res.status(409).json({ error: 'Username is already taken' });
                }

                // Update username
                await pool.query(
                    'UPDATE users SET username = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                    [newUsername, req.user.id]
                );
            }
        }

        // Update other fields
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

// Update user tags
router.put('/me/tags', authenticateToken, async (req, res, next) => {
    try {
        const { tags } = req.body;
        const validTags = getValidTags();

        if (!Array.isArray(tags)) {
            return res.status(400).json({ error: 'Tags must be an array' });
        }

        // Validate all tags
        const invalidTags = tags.filter(tag => !validTags.includes(tag));
        if (invalidTags.length > 0) {
            return res.status(400).json({
                error: `Invalid tags: ${invalidTags.join(', ')}. Valid tags are: ${validTags.join(', ')}`
            });
        }

        const pool = getPool();

        // Delete existing tags
        await pool.query('DELETE FROM user_tags WHERE user_id = $1', [req.user.id]);

        // Insert new tags
        for (const tag of tags) {
            await pool.query(
                'INSERT INTO user_tags (id, user_id, tag) VALUES ($1, $2, $3)',
                [uuidv4(), req.user.id, tag]
            );
        }

        res.json({ message: 'Tags updated', tags });
    } catch (error) {
        next(error);
    }
});

// Get valid tags
router.get('/tags', (req, res) => {
    res.json({ tags: getValidTags() });
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

// Delete account
router.delete('/me', authenticateToken, async (req, res, next) => {
    try {
        const { password, confirmation } = req.body;
        const pool = getPool();

        // Verify user wants to delete (confirmation must be "DELETE")
        if (confirmation !== 'DELETE') {
            return res.status(400).json({
                error: 'Please type DELETE to confirm account deletion'
            });
        }

        // Get user to check if they're OAuth-only or have password
        const userResult = await pool.query(
            'SELECT password_hash, oauth_provider FROM users WHERE id = $1',
            [req.user.id]
        );
        const user = userResult.rows[0];

        // If user has password, require it for deletion
        if (user.password_hash && user.password_hash.length > 0) {
            if (!password) {
                return res.status(400).json({ error: 'Password is required to delete account' });
            }

            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Incorrect password' });
            }
        }

        // Delete user (cascades to images, sessions, tags due to ON DELETE CASCADE)
        await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);

        // Clear auth cookie
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
        });

        res.json({ message: 'Account deleted successfully' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
