# Frontend Integration Notes

Base URL in development: `http://localhost:5000/api`

Use Axios with credentials enabled:

```js
axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true
});
```

## Auth

- `POST /auth/send-otp` body `{ "email": "user@example.com" }`
- `POST /auth/verify-otp` body `{ "email": "user@example.com", "otp": "123456", "name": "Optional" }`
- `GET /auth/me`
- `POST /auth/logout`

JWT is stored in an HttpOnly cookie. Do not store it in localStorage.

When SMTP is skipped in development, `POST /auth/send-otp` also returns `devOtp` in the JSON response so login can be tested locally.

## Books

- `GET /books?featured=true&category=AI&q=search&page=1&limit=12`
- `GET /books/:slug`
- Admin only multipart `POST /books`
- Admin only multipart `PUT /books/:id`
- Admin only `DELETE /books/:id`

Multipart fields: `title`, `author`, `description`, `price`, `category`, `language`, `pages`, `tags`, `featured`, `trending`, `cover`, `previewImages`, `previewPdf`, `pdf` or `document`.

DOCX uploads require LibreOffice/soffice on the backend host.

## Purchase Flow

- `POST /purchase` authenticated multipart body: `bookId`, optional `note`, optional `paymentScreenshot`
- `GET /purchase/me`
- Admin `GET /purchase/admin?status=pending`
- Admin `PATCH /purchase/:id/approve`
- Admin `PATCH /purchase/:id/reject`

## Reader

- `GET /reader/:bookId` returns access metadata and a protected PDF stream URL.
- `GET /reader/:bookId/stream` streams the PDF only after auth and approved purchase checks.
- `PATCH /reader/:bookId/progress` body `{ "currentPage": 10, "progress": 28 }`
- `POST /reader/:bookId/bookmarks` body `{ "page": 10, "label": "Chapter 2", "note": "Optional" }`
- `DELETE /reader/bookmarks/:bookmarkId`

## Needed From You

- MongoDB URI
- JWT secret
- SMTP host, port, username, password, and from address for OTP email
- Admin email address list
- UPI ID and QR image URL
- Storage choice: local for development, Cloudinary for production
- If DOCX upload is required: LibreOffice installed on the server or `LIBREOFFICE_PATH`/`SOFFICE_PATH`