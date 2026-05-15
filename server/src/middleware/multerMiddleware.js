import multer from "multer";
import path from 'path';
import crypto from 'crypto';

const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
];

const BLOCKED_EXTENSIONS = [
    '.exe', '.sh', '.bat', '.php', '.js', '.py', '.rb', '.pl'
];

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './public/temp')
    },
    filename: function (req, file, cb) {
        // Sanitize filename: remove special characters and add random suffix
        // We keep the original name but clean it to avoid traversal or shell injection
        const cleanName = path.parse(file.originalname).name.replace(/[^a-zA-Z0-9]/g, '_');
        const uniqueSuffix = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname).toLowerCase();
        
        cb(null, `${cleanName}-${uniqueSuffix}${ext}`);
    }
})

const fileFilter = (req, file, cb) => {
    // 1. Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return cb(new Error('Invalid file type. Only JPEG, PNG, WEBP and PDF are allowed.'), false);
    }

    // 2. Double check extension for executable blocking
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
        return cb(new Error('Executable files are strictly prohibited.'), false);
    }

    cb(null, true);
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit (adjusted from 5MB for flexibility)
        files: 5 // Limit number of files in one request
    }
});