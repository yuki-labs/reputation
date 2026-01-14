const express = require('express');
const { getPool } = require('../database/init');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get user profile by username
router.get('/:username', optionalAuth, async (req, res, next) => {
    try {
        const pool = getPool();

        const userResult = await pool.query(
            `SELECT id, username, display_name, avatar_url, bio, created_at
       FROM users 
       WHERE username = $1 AND is_active = true`,
            [req.params.username.toLowerCase()]
        );

        const user = userResult.rows[0];

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get image count
        const statsResult = await pool.query(
            `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN is_public = true THEN 1 ELSE 0 END) as public
       FROM images WHERE user_id = $1`,
            [user.id]
        );

        const stats = statsResult.rows[0];

        res.json({
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            avatarUrl: user.avatar_url,
            bio: user.bio,
            createdAt: user.created_at,
            stats: {
                totalImages: parseInt(stats.total) || 0,
                publicImages: parseInt(stats.public) || 0
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get user's public images
router.get('/:username/images', optionalAuth, async (req, res, next) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const pool = getPool();

        const userResult = await pool.query(
            'SELECT id FROM users WHERE username = $1 AND is_active = true',
            [req.params.username.toLowerCase()]
        );

        const user = userResult.rows[0];

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // If viewing own images, show all. Otherwise, only public
        const isOwner = req.user && req.user.id === user.id;
        const whereClause = isOwner ? 'user_id = $1' : 'user_id = $1 AND is_public = true';

        const imagesResult = await pool.query(
            `SELECT id, filename, thumbnail_filename, title, width, height, is_public, created_at
       FROM images 
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
            [user.id, parseInt(limit), parseInt(offset)]
        );

        const countResult = await pool.query(
            `SELECT COUNT(*) as count FROM images WHERE ${whereClause}`,
            [user.id]
        );

        const total = parseInt(countResult.rows[0].count);

        res.json({
            images: imagesResult.rows.map(img => ({
                id: img.id,
                url: `/uploads/${img.filename}`,
                thumbnailUrl: img.thumbnail_filename ? `/uploads/thumbnails/${img.thumbnail_filename}` : null,
                title: img.title,
                width: img.width,
                height: img.height,
                isPublic: img.is_public,
                createdAt: img.created_at
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
