const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Use STORAGE_PATH env var for Railway volume, fallback to local uploads folder
const STORAGE_DIR = process.env.STORAGE_PATH || path.join(__dirname, '../../data');
const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');

// Ensure directories exist
[UPLOADS_DIR, THUMBNAILS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Allowed image types
const ALLOWED_TYPES = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif'
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const ext = ALLOWED_TYPES[file.mimetype] || path.extname(file.originalname).slice(1);
        const uniqueName = `${uuidv4()}.${ext}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    if (ALLOWED_TYPES[file.mimetype]) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type. Allowed types: ${Object.keys(ALLOWED_TYPES).join(', ')}`), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 10 // Max 10 files per request
    }
});

function getUploadPaths() {
    return { UPLOADS_DIR, THUMBNAILS_DIR };
}

module.exports = { upload, UPLOADS_DIR, THUMBNAILS_DIR, ALLOWED_TYPES, getUploadPaths };
