const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { getPool } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');
const { upload, getUploadPaths } = require('../middleware/upload');

const router = express.Router();

// Allowed file types for message attachments
const ALLOWED_TYPES = {
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    video: ['video/mp4', 'video/webm', 'video/quicktime'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4']
};

function getAttachmentType(mimetype) {
    if (ALLOWED_TYPES.image.includes(mimetype)) return 'image';
    if (ALLOWED_TYPES.video.includes(mimetype)) return 'video';
    if (ALLOWED_TYPES.audio.includes(mimetype)) return 'audio';
    return null;
}

// Get all conversations for current user
router.get('/conversations', authenticateToken, async (req, res, next) => {
    try {
        const pool = getPool();
        const userId = req.user.id;

        const result = await pool.query(`
      SELECT 
        c.id,
        c.last_message_at,
        c.created_at,
        CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END as other_user_id,
        u.username as other_username,
        u.display_name as other_display_name,
        u.avatar_url as other_avatar_url,
        (SELECT COALESCE(content, 
          CASE attachment_type 
            WHEN 'image' THEN '📷 Image'
            WHEN 'video' THEN '🎬 Video'  
            WHEN 'audio' THEN '🎵 Audio'
            ELSE 'Attachment'
          END
        ) FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != $1 AND is_read = false) as unread_count
      FROM conversations c
      JOIN users u ON u.id = CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END
      WHERE c.user1_id = $1 OR c.user2_id = $1
      ORDER BY c.last_message_at DESC
    `, [userId]);

        res.json({ conversations: result.rows });
    } catch (error) {
        next(error);
    }
});

// Get or create conversation with a user
router.post('/conversations', authenticateToken, async (req, res, next) => {
    try {
        const { userId: otherUserId } = req.body;
        const pool = getPool();
        const currentUserId = req.user.id;

        if (!otherUserId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        if (otherUserId === currentUserId) {
            return res.status(400).json({ error: 'Cannot message yourself' });
        }

        // Check if other user exists
        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [otherUserId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Order user IDs consistently for the unique constraint
        const [user1, user2] = [currentUserId, otherUserId].sort();

        // Try to find existing conversation
        let result = await pool.query(
            'SELECT id FROM conversations WHERE user1_id = $1 AND user2_id = $2',
            [user1, user2]
        );

        let conversationId;
        if (result.rows.length > 0) {
            conversationId = result.rows[0].id;
        } else {
            // Create new conversation
            conversationId = uuidv4();
            await pool.query(
                'INSERT INTO conversations (id, user1_id, user2_id) VALUES ($1, $2, $3)',
                [conversationId, user1, user2]
            );
        }

        res.json({ conversationId });
    } catch (error) {
        next(error);
    }
});

// Get messages in a conversation
router.get('/conversations/:id/messages', authenticateToken, async (req, res, next) => {
    try {
        const { id: conversationId } = req.params;
        const { before, limit = 50 } = req.query;
        const pool = getPool();
        const userId = req.user.id;

        // Verify user is in this conversation
        const convCheck = await pool.query(
            'SELECT id FROM conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
            [conversationId, userId]
        );

        if (convCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Get messages with attachment info
        let query = `
      SELECT m.id, m.content, m.sender_id, m.is_read, m.created_at,
             m.attachment_url, m.attachment_type, m.attachment_name,
             u.username as sender_username, u.display_name as sender_display_name, u.avatar_url as sender_avatar_url
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1
    `;
        const params = [conversationId];

        if (before) {
            query += ` AND m.created_at < $2`;
            params.push(before);
        }

        query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));

        const result = await pool.query(query, params);

        // Mark messages as read
        await pool.query(
            'UPDATE messages SET is_read = true WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false',
            [conversationId, userId]
        );

        res.json({ messages: result.rows.reverse() });
    } catch (error) {
        next(error);
    }
});

// Send a text message
router.post('/conversations/:id/messages', authenticateToken, async (req, res, next) => {
    try {
        const { id: conversationId } = req.params;
        const { content } = req.body;
        const pool = getPool();
        const userId = req.user.id;

        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        if (content.length > 2000) {
            return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
        }

        // Verify user is in this conversation
        const convCheck = await pool.query(
            'SELECT id FROM conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
            [conversationId, userId]
        );

        if (convCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Create message
        const messageId = uuidv4();
        await pool.query(
            'INSERT INTO messages (id, conversation_id, sender_id, content) VALUES ($1, $2, $3, $4)',
            [messageId, conversationId, userId, content.trim()]
        );

        // Update conversation last_message_at
        await pool.query(
            'UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
            [conversationId]
        );

        // Get the created message with sender info
        const result = await pool.query(`
      SELECT m.id, m.content, m.sender_id, m.is_read, m.created_at,
             m.attachment_url, m.attachment_type, m.attachment_name,
             u.username as sender_username, u.display_name as sender_display_name, u.avatar_url as sender_avatar_url
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.id = $1
    `, [messageId]);

        res.json({ message: result.rows[0] });
    } catch (error) {
        next(error);
    }
});

// Send a message with attachment
router.post('/conversations/:id/attachment', authenticateToken, upload.single('file'), async (req, res, next) => {
    try {
        const { id: conversationId } = req.params;
        const { content } = req.body;
        const pool = getPool();
        const userId = req.user.id;

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Check file type
        const attachmentType = getAttachmentType(req.file.mimetype);
        if (!attachmentType) {
            return res.status(400).json({ error: 'Unsupported file type. Allowed: images, videos, audio files.' });
        }

        // Verify user is in this conversation
        const convCheck = await pool.query(
            'SELECT id FROM conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
            [conversationId, userId]
        );

        if (convCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Create message with attachment
        const messageId = uuidv4();
        const attachmentUrl = `/uploads/${req.file.filename}`;
        const attachmentName = req.file.originalname;

        await pool.query(
            `INSERT INTO messages (id, conversation_id, sender_id, content, attachment_url, attachment_type, attachment_name) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [messageId, conversationId, userId, content?.trim() || null, attachmentUrl, attachmentType, attachmentName]
        );

        // Update conversation last_message_at
        await pool.query(
            'UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
            [conversationId]
        );

        // Get the created message with sender info
        const result = await pool.query(`
      SELECT m.id, m.content, m.sender_id, m.is_read, m.created_at,
             m.attachment_url, m.attachment_type, m.attachment_name,
             u.username as sender_username, u.display_name as sender_display_name, u.avatar_url as sender_avatar_url
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.id = $1
    `, [messageId]);

        res.json({ message: result.rows[0] });
    } catch (error) {
        next(error);
    }
});

// Get unread message count
router.get('/unread-count', authenticateToken, async (req, res, next) => {
    try {
        const pool = getPool();
        const userId = req.user.id;

        const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE (c.user1_id = $1 OR c.user2_id = $1)
        AND m.sender_id != $1
        AND m.is_read = false
    `, [userId]);

        res.json({ unreadCount: parseInt(result.rows[0].count) });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
