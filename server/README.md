# Brandy Backend Server

This is the backend server for the Brandy project, built with Node.js, Express, and Mongoose.

## 🚀 Getting Started

Follow these steps to set up the project on your local machine.

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v22 or higher recommended)
- [MongoDB Atlas](https://www.mongodb.com/products/platform/atlas-database) account

### 2. Setup

1.  **Extract the project** files and navigate to the project directory:

    ```bash
    cd Brandy1/server
    ```

2.  **Install dependencies**:

    ```bash
    npm install
    ```

3.  **Configure environment variables**:
    - Copy the `.env.example` file to a new file named `.env`:
      ```bash
      cp .env.example .env
      ```
    - Open `.env` and fill in your credentials (MongoDB URI, Cloudinary, Email, etc.).

4.  **Whitelist your IP**:
    - Ensure your current IP address is whitelisted in your MongoDB Atlas project settings.

### 3. Running the Server

- To start the server in development mode (with auto-restart):
  ```bash
  npm run dev
  ```
- To start the server in production mode:
  ```bash
  npm start
  ```


  

The server will be running on `http://localhost:8000` (or the port specified in your `.env`).




// for remote cerver access : terminal   ngrok http 8000  