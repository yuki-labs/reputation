const jwt = require('jsonwebtoken');
const { getDatabase } = require('../database/init');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

function authenticateToken(req, res, next) {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Verify user still exists and is active
        const db = getDatabase();
        const user = db.prepare('SELECT id, username, email, display_name, avatar_url, is_active FROM users WHERE id = ?').get(decoded.userId);

        if (!user || !user.is_active) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Session expired, please login again' });
        }
        return res.status(403).json({ error: 'Invalid token' });
    }
}

function optionalAuth(req, res, next) {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const db = getDatabase();
        const user = db.prepare('SELECT id, username, email, display_name, avatar_url, is_active FROM users WHERE id = ?').get(decoded.userId);

        req.user = user && user.is_active ? user : null;
    } catch {
        req.user = null;
    }

    next();
}

function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { authenticateToken, optionalAuth, generateToken, JWT_SECRET };
