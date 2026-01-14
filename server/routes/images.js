const express = require('express');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database/init');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { upload, getUploadPaths } = require('../middleware/upload');

const router = express.Router();

// Get paths dynamically
function getPaths() {
    return getUploadPaths();
}

// Generate thumbnail
async function generateThumbnail(filename) {
    const { UPLOADS_DIR, THUMBNAILS_DIR } = getPaths();
    const inputPath = path.join(UPLOADS_DIR, filename);
    const thumbnailName = `thumb_${filename}`;
    const outputPath = path.join(THUMBNAILS_DIR, thumbnailName);

    try {
        await sharp(inputPath)
            .resize(400, 400, { fit: 'cover', position: 'center' })
            .jpeg({ quality: 80 })
            .toFile(outputPath);
        return thumbnailName;
    } catch (error) {
        console.error('Error generating thumbnail:', error);
        return null;
    }
}

// Get image metadata
async function getImageMetadata(filepath) {
    try {
        const metadata = await sharp(filepath).metadata();
        return { width: metadata.width, height: metadata.height };
    } catch {
        return { width: null, height: null };
    }
}

// Upload images
router.post('/upload', authenticateToken, upload.array('images', 10), async (req, res, next) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No images uploaded' });
        }

        const db = getDatabase();
        const uploadedImages = [];

        for (const file of req.files) {
            const imageId = uuidv4();
            const { width, height } = await getImageMetadata(file.path);
            const thumbnailFilename = await generateThumbnail(file.filename);

            db.prepare(`
        INSERT INTO images (id, user_id, filename, original_name, mime_type, size, width, height, thumbnail_filename, title)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
                imageId,
                req.user.id,
                file.filename,
                file.originalname,
                file.mimetype,
                file.size,
                width,
                height,
                thumbnailFilename,
                path.parse(file.originalname).name
            );

            uploadedImages.push({
                id: imageId,
                filename: file.filename,
                originalName: file.originalname,
                thumbnailUrl: thumbnailFilename ? `/uploads/thumbnails/${thumbnailFilename}` : null,
                url: `/uploads/${file.filename}`,
                width,
                height,
                size: file.size
            });
        }

        res.status(201).json({
            message: `${uploadedImages.length} image(s) uploaded successfully`,
            images: uploadedImages
        });
    } catch (error) {
        next(error);
    }
});

// Get user's images
router.get('/my', authenticateToken, (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const db = getDatabase();

    const images = db.prepare(`
    SELECT id, filename, original_name, mime_type, size, width, height, 
           thumbnail_filename, title, description, is_public, created_at
    FROM images 
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, parseInt(limit), parseInt(offset));

    const total = db.prepare('SELECT COUNT(*) as count FROM images WHERE user_id = ?')
        .get(req.user.id).count;

    res.json({
        images: images.map(img => ({
            id: img.id,
            filename: img.filename,
            originalName: img.original_name,
            url: `/uploads/${img.filename}`,
            thumbnailUrl: img.thumbnail_filename ? `/uploads/thumbnails/${img.thumbnail_filename}` : null,
            mimeType: img.mime_type,
            size: img.size,
            width: img.width,
            height: img.height,
            title: img.title,
            description: img.description,
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

// Get public images (gallery)
router.get('/gallery', optionalAuth, (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const db = getDatabase();

    const images = db.prepare(`
    SELECT i.id, i.filename, i.original_name, i.width, i.height, 
           i.thumbnail_filename, i.title, i.created_at,
           u.username, u.display_name, u.avatar_url
    FROM images i
    JOIN users u ON i.user_id = u.id
    WHERE i.is_public = 1
    ORDER BY i.created_at DESC
    LIMIT ? OFFSET ?
  `).all(parseInt(limit), parseInt(offset));

    const total = db.prepare('SELECT COUNT(*) as count FROM images WHERE is_public = 1')
        .get().count;

    res.json({
        images: images.map(img => ({
            id: img.id,
            url: `/uploads/${img.filename}`,
            thumbnailUrl: img.thumbnail_filename ? `/uploads/thumbnails/${img.thumbnail_filename}` : null,
            title: img.title,
            width: img.width,
            height: img.height,
            createdAt: img.created_at,
            author: {
                username: img.username,
                displayName: img.display_name,
                avatarUrl: img.avatar_url
            }
        })),
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    });
});

// Get single image
router.get('/:id', optionalAuth, (req, res) => {
    const db = getDatabase();

    const image = db.prepare(`
    SELECT i.*, u.username, u.display_name, u.avatar_url
    FROM images i
    JOIN users u ON i.user_id = u.id
    WHERE i.id = ?
  `).get(req.params.id);

    if (!image) {
        return res.status(404).json({ error: 'Image not found' });
    }

    // Check access
    if (!image.is_public && (!req.user || req.user.id !== image.user_id)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
        id: image.id,
        filename: image.filename,
        originalName: image.original_name,
        url: `/uploads/${image.filename}`,
        thumbnailUrl: image.thumbnail_filename ? `/uploads/thumbnails/${image.thumbnail_filename}` : null,
        mimeType: image.mime_type,
        size: image.size,
        width: image.width,
        height: image.height,
        title: image.title,
        description: image.description,
        isPublic: !!image.is_public,
        createdAt: image.created_at,
        author: {
            username: image.username,
            displayName: image.display_name,
            avatarUrl: image.avatar_url
        }
    });
});

// Update image
router.patch('/:id', authenticateToken, (req, res) => {
    const { title, description, isPublic } = req.body;
    const db = getDatabase();

    const image = db.prepare('SELECT user_id FROM images WHERE id = ?').get(req.params.id);

    if (!image) {
        return res.status(404).json({ error: 'Image not found' });
    }

    if (image.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
    }

    db.prepare(`
    UPDATE images 
    SET title = COALESCE(?, title),
        description = COALESCE(?, description),
        is_public = COALESCE(?, is_public),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(title, description, isPublic !== undefined ? (isPublic ? 1 : 0) : null, req.params.id);

    res.json({ message: 'Image updated' });
});

// Delete image
router.delete('/:id', authenticateToken, (req, res) => {
    const db = getDatabase();
    const { UPLOADS_DIR, THUMBNAILS_DIR } = getPaths();

    const image = db.prepare('SELECT user_id, filename, thumbnail_filename FROM images WHERE id = ?')
        .get(req.params.id);

    if (!image) {
        return res.status(404).json({ error: 'Image not found' });
    }

    if (image.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
    }

    // Delete files
    try {
        const imagePath = path.join(UPLOADS_DIR, image.filename);
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }

        if (image.thumbnail_filename) {
            const thumbPath = path.join(THUMBNAILS_DIR, image.thumbnail_filename);
            if (fs.existsSync(thumbPath)) {
                fs.unlinkSync(thumbPath);
            }
        }
    } catch (error) {
        console.error('Error deleting files:', error);
    }

    // Delete from database
    db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);

    res.json({ message: 'Image deleted' });
});

module.exports = router;
