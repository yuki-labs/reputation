const jwt = require('jsonwebtoken');
const { getPool } = require('../database/init');

// In production, JWT_SECRET environment variable is required
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('JWT_SECRET environment variable is required in production'); })()
    : 'dev-secret-key-do-not-use-in-production');

async function authenticateToken(req, res, next) {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Verify user still exists and is active
        const pool = getPool();
        const result = await pool.query(
            'SELECT id, username, email, display_name, avatar_url, is_active FROM users WHERE id = $1',
            [decoded.userId]
        );

        const user = result.rows[0];

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

async function optionalAuth(req, res, next) {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const pool = getPool();
        const result = await pool.query(
            'SELECT id, username, email, display_name, avatar_url, is_active FROM users WHERE id = $1',
            [decoded.userId]
        );

        const user = result.rows[0];
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
