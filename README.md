# Brandly - AI-Based Brand Influencer Platform 🚀

Brandly is a comprehensive platform designed to bridge the gap between brands and influencers. It leverages AI-driven insights to facilitate seamless collaborations, campaign management, and performance tracking.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB (Mongoose ODM)
- **Authentication**: JWT, Passport.js (Google OAuth 2.0)
- **File Storage**: Cloudinary
- **Communication**: Nodemailer (SMTP for OTP)
- **Frontend**: (Refer to the frontend repository/directory)

---

## 🚀 Getting Started

Follow these steps to set up the project on your local machine.

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v22 or higher recommended)
- [MongoDB Atlas](https://www.mongodb.com/products/platform/atlas-database) account
- [Cloudinary](https://cloudinary.com/) account (for media uploads)

### 2. Installation

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd Brandy1
    ```

2.  **Install dependencies**:
    From the root directory:
    ```bash
    npm install
    ```
    This will install root dependencies. To install server dependencies specifically:
    ```bash
    npm run install-server
    ```

### 3. Environment Configuration

Navigate to the `server` directory and create a `.env` file:
```bash
cd server
cp .env.example .env
```

Open the `.env` file and fill in the following required variables:

| Variable | Description |
| :--- | :--- |
| `PORT` | The port the server will run on (e.g., `8000`). |
| `CORS_ORIGIN` | The frontend URL allowed to access the API (e.g., `http://localhost:5173`). |
| `MONGODB_URI` | Your MongoDB Atlas connection string. |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary Cloud Name. |
| `CLOUDINARY_API_KEY` | Your Cloudinary API Key. |
| `CLOUDINARY_API_SECRET` | Your Cloudinary API Secret. |
| `ACCESS_TOKEN_SECRET` | A long, random string for signing Access Tokens. |
| `ACCESS_TOKEN_EXPIRY` | Expiry time for Access Tokens (e.g., `1d`). |
| `REFRESH_TOKEN_SECRET` | A long, random string for signing Refresh Tokens. |
| `REFRESH_TOKEN_EXPIRY` | Expiry time for Refresh Tokens (e.g., `10d`). |
| `EMAIL_HOST` | SMTP server host (e.g., `smtp.gmail.com`). |
| `EMAIL_PORT` | SMTP port (e.g., `587`). |
| `EMAIL_USER` | Your email address for sending OTPs. |
| `EMAIL_PASS` | Your email app password. |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret. |
| `GOOGLE_CALLBACK_URL` | Google OAuth Callback URL (e.g., `http://localhost:8000/api/v1/users/google/callback`). |

### 4. Running the Project

From the **root directory**, you can run:

- **Development Mode**:
  ```bash
  npm run dev
  ```
- **Production Mode**:
  ```bash
  npm start
  ```

---

## 📖 Documentation

- **API Reference**: Detailed API documentation for frontend integration can be found in [api.md](./api.md).
- **Project Structure**:
  - `/server`: Express.js backend source code.
  - `/server/src/routes`: API route definitions.
  - `/server/src/controllers`: Business logic for each endpoint.

---

## 🤝 Contributing

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

_Last Updated: March 2026_
