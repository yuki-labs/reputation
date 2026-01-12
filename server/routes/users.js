const express = require('express');
const { getDatabase } = require('../database/init');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get user profile by username
router.get('/:username', optionalAuth, (req, res) => {
    const db = getDatabase();

    const user = db.prepare(`
    SELECT id, username, display_name, avatar_url, bio, created_at
    FROM users 
    WHERE username = ? AND is_active = 1
  `).get(req.params.username.toLowerCase());

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    // Get image count
    const imageStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN is_public = 1 THEN 1 ELSE 0 END) as public
    FROM images WHERE user_id = ?
  `).get(user.id);

    res.json({
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        bio: user.bio,
        createdAt: user.created_at,
        stats: {
            totalImages: imageStats.total,
            publicImages: imageStats.public
        }
    });
});

// Get user's public images
router.get('/:username/images', optionalAuth, (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const db = getDatabase();

    const user = db.prepare('SELECT id FROM users WHERE username = ? AND is_active = 1')
        .get(req.params.username.toLowerCase());

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    // If viewing own images, show all. Otherwise, only public
    const isOwner = req.user && req.user.id === user.id;
    const whereClause = isOwner ? 'user_id = ?' : 'user_id = ? AND is_public = 1';

    const images = db.prepare(`
    SELECT id, filename, thumbnail_filename, title, width, height, is_public, created_at
    FROM images 
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(user.id, parseInt(limit), parseInt(offset));

    const total = db.prepare(`SELECT COUNT(*) as count FROM images WHERE ${whereClause}`)
        .get(user.id).count;

    res.json({
        images: images.map(img => ({
            id: img.id,
            url: `/uploads/${img.filename}`,
            thumbnailUrl: img.thumbnail_filename ? `/uploads/thumbnails/${img.thumbnail_filename}` : null,
            title: img.title,
            width: img.width,
            height: img.height,
            isPublic: !!img.is_public,
            createdAt: img.created_at
        })),
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    });
});

module.exports = router;
