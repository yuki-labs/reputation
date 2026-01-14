const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { initializeDatabase, getStoragePath } = require('./database/init');
const { getUploadPaths } = require('./middleware/upload');
const authRoutes = require('./routes/auth');
const imageRoutes = require('./routes/images');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Trust proxy for Railway (needed for secure cookies)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Serve uploads from storage directory
const { UPLOADS_DIR } = getUploadPaths();
app.use('/uploads', express.static(UPLOADS_DIR));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/users', userRoutes);

// SPA fallback - serve index.html for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
    });
});

// Initialize database and start server
async function start() {
    try {
        await initializeDatabase();

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Storage path: ${getStoragePath()}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

start();
