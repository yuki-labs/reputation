const express = require('express');
const { getPool } = require('../database/init');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Helper to get user tags
async function getUserTags(pool, userId) {
    const result = await pool.query(
        'SELECT tag FROM user_tags WHERE user_id = $1 ORDER BY tag',
        [userId]
    );
    return result.rows.map(row => row.tag);
}

// Search users (supports search by query, filter by tag, or both)
router.get('/search', async (req, res, next) => {
    try {
        const { q, tag, page = 1, limit = 20 } = req.query;
        const hasQuery = q && q.trim().length >= 2;
        const hasTag = tag && tag.trim().length > 0;

        // Must have at least a query or a tag
        if (!hasQuery && !hasTag) {
            return res.json({ users: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
        }

        const offset = (page - 1) * limit;
        const pool = getPool();

        let usersQuery;
        let countQuery;
        let queryParams;

        if (hasQuery && hasTag) {
            // Search with both query and tag filter
            const searchTerm = `%${q.trim().toLowerCase()}%`;
            usersQuery = `
        SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.created_at,
               COUNT(DISTINCT i.id) as image_count,
               ARRAY_AGG(DISTINCT ut.tag) FILTER (WHERE ut.tag IS NOT NULL) as tags
        FROM users u
        LEFT JOIN images i ON u.id = i.user_id AND i.is_public = true
        LEFT JOIN user_tags ut ON u.id = ut.user_id
        WHERE u.is_active = true 
          AND (LOWER(u.username) LIKE $1 OR LOWER(u.display_name) LIKE $1)
          AND EXISTS (SELECT 1 FROM user_tags ut2 WHERE ut2.user_id = u.id AND ut2.tag = $2)
        GROUP BY u.id
        ORDER BY 
          CASE WHEN LOWER(u.username) = $3 THEN 0
               WHEN LOWER(u.username) LIKE $4 THEN 1
               ELSE 2 END,
          u.created_at DESC
        LIMIT $5 OFFSET $6`;

            countQuery = `
        SELECT COUNT(DISTINCT u.id) as count FROM users u
        INNER JOIN user_tags ut ON u.id = ut.user_id AND ut.tag = $2
        WHERE u.is_active = true 
          AND (LOWER(u.username) LIKE $1 OR LOWER(u.display_name) LIKE $1)`;

            queryParams = [searchTerm, tag, q.trim().toLowerCase(), `${q.trim().toLowerCase()}%`, parseInt(limit), parseInt(offset)];

        } else if (hasTag) {
            // Tag only - show all users with this tag
            usersQuery = `
        SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.created_at,
               COUNT(DISTINCT i.id) as image_count,
               ARRAY_AGG(DISTINCT ut.tag) FILTER (WHERE ut.tag IS NOT NULL) as tags
        FROM users u
        LEFT JOIN images i ON u.id = i.user_id AND i.is_public = true
        LEFT JOIN user_tags ut ON u.id = ut.user_id
        WHERE u.is_active = true 
          AND EXISTS (SELECT 1 FROM user_tags ut2 WHERE ut2.user_id = u.id AND ut2.tag = $1)
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT $2 OFFSET $3`;

            countQuery = `
        SELECT COUNT(DISTINCT u.id) as count FROM users u
        INNER JOIN user_tags ut ON u.id = ut.user_id AND ut.tag = $1
        WHERE u.is_active = true`;

            queryParams = [tag, parseInt(limit), parseInt(offset)];

        } else {
            // Query only - search without tag filter
            const searchTerm = `%${q.trim().toLowerCase()}%`;
            usersQuery = `
        SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.created_at,
               COUNT(DISTINCT i.id) as image_count,
               ARRAY_AGG(DISTINCT ut.tag) FILTER (WHERE ut.tag IS NOT NULL) as tags
        FROM users u
        LEFT JOIN images i ON u.id = i.user_id AND i.is_public = true
        LEFT JOIN user_tags ut ON u.id = ut.user_id
        WHERE u.is_active = true 
          AND (LOWER(u.username) LIKE $1 OR LOWER(u.display_name) LIKE $1)
        GROUP BY u.id
        ORDER BY 
          CASE WHEN LOWER(u.username) = $2 THEN 0
               WHEN LOWER(u.username) LIKE $3 THEN 1
               ELSE 2 END,
          u.created_at DESC
        LIMIT $4 OFFSET $5`;

            countQuery = `
        SELECT COUNT(*) as count FROM users 
        WHERE is_active = true 
          AND (LOWER(username) LIKE $1 OR LOWER(display_name) LIKE $1)`;

            queryParams = [searchTerm, q.trim().toLowerCase(), `${q.trim().toLowerCase()}%`, parseInt(limit), parseInt(offset)];
        }

        const usersResult = await pool.query(usersQuery, queryParams);

        // Build count query params
        let countParams;
        if (hasQuery && hasTag) {
            countParams = [`%${q.trim().toLowerCase()}%`, tag];
        } else if (hasTag) {
            countParams = [tag];
        } else {
            countParams = [`%${q.trim().toLowerCase()}%`];
        }

        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            users: usersResult.rows.map(user => ({
                id: user.id,
                username: user.username,
                displayName: user.display_name,
                avatarUrl: user.avatar_url,
                bio: user.bio,
                imageCount: parseInt(user.image_count) || 0,
                tags: user.tags || [],
                createdAt: user.created_at
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

        // Get tags
        const tags = await getUserTags(pool, user.id);

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
            tags,
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
