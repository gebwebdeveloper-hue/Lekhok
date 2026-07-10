# LEKHAK Backend

Production-oriented Express + MongoDB API for OTP authentication, admin book uploads, manual UPI purchase approval, and protected PDF reader access.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill `MONGODB_URI`, `JWT_SECRET`, SMTP credentials, `ADMIN_EMAILS`, and UPI details.
3. Install dependencies: `npm install`.
4. Start dev server: `npm run dev`.

## Main Routes

- `POST /api/auth/send-otp`
- `POST /api/auth/verify-otp`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/books`
- `GET /api/books/:slug`
- `POST /api/books` admin multipart upload
- `POST /api/purchase` authenticated multipart request
- `GET /api/purchase/me`
- `GET /api/purchase/admin` admin
- `PATCH /api/purchase/:id/approve` admin
- `GET /api/reader/:bookId`
- `GET /api/reader/:bookId/stream`

## Required Integrations

- SMTP is needed for real OTP delivery. Without SMTP, dev mode logs JSON email output.
- Cloudinary is optional. Set `STORAGE_DRIVER=cloudinary` and credentials to upload assets remotely.
- Local storage works for development through `/uploads/*`.