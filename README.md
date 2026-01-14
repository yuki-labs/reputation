# VerifiedUsers - Image Upload Platform

A premium user account and image upload application built with Node.js, Express, and SQLite.

## Features

- 🔐 **User Authentication** - Secure registration & login with bcrypt password hashing
- 📤 **Image Upload** - Drag & drop uploads with automatic thumbnail generation
- 🖼️ **Gallery** - Beautiful masonry grid with lightbox viewer
- 👤 **User Profiles** - Customizable profiles with bio and avatar
- 🌐 **Public/Private** - Control visibility of your images
- 📱 **Responsive** - Works on desktop and mobile devices

## Tech Stack

- **Backend**: Node.js, Express
- **Database**: SQLite with better-sqlite3
- **Auth**: JWT tokens with HTTP-only cookies
- **Images**: Multer + Sharp for processing
- **Frontend**: Vanilla JS SPA with modern CSS

## Local Development

```bash
# Install dependencies
npm install

# Start development server (with auto-reload)
npm run dev

# Start production server
npm start
```

Visit http://localhost:3000

## Deploy to Railway

### Quick Deploy

1. Push your code to a GitHub repository
2. Go to [Railway](https://railway.app) and create a new project
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Add these environment variables:
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = (generate a secure random string, e.g., `openssl rand -base64 32`)

### Important: Persistent Storage

⚠️ **Railway's filesystem is ephemeral** - uploaded images and the SQLite database will be lost on each deploy.

For production use, you should:

**Option 1: Add Railway Volume (Recommended)**
1. In your Railway project, go to your service
2. Click "Add Volume"
3. Set mount path to `/app/data` for database
4. Set another volume mount to `/app/uploads` for images

**Option 2: Use External Services**
- **Database**: Switch to PostgreSQL (Railway provides this)
- **Images**: Use cloud storage like Cloudinary, AWS S3, or Cloudflare R2

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Automatically set by Railway |
| `NODE_ENV` | Yes | Set to `production` |
| `JWT_SECRET` | Yes | Secret key for JWT signing (min 32 chars) |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `PATCH /api/auth/me` - Update profile
- `POST /api/auth/change-password` - Change password

### Images
- `POST /api/images/upload` - Upload images (multipart/form-data)
- `GET /api/images/my` - Get user's images
- `GET /api/images/gallery` - Get public gallery
- `GET /api/images/:id` - Get single image
- `PATCH /api/images/:id` - Update image
- `DELETE /api/images/:id` - Delete image

### Users
- `GET /api/users/:username` - Get user profile
- `GET /api/users/:username/images` - Get user's public images

## License

MIT
