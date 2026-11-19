# Notes & Email Cloud Suite (Local Fullstack + AWS S3 & SES)

A fullstack application running on your **local machine**:
* **Frontend**: React (Vite) running on [http://localhost:3000](http://localhost:3000)
* **Backend**: Node.js Express REST API running on [http://localhost:5000](http://localhost:5000)
* **Database**: Local MongoDB (`mongodb://127.0.0.1:27017/notesdb`)
* **AWS S3**: Cloud Object Storage for file & image attachments
* **AWS SES**: Simple Email Service to send real emails to anyone and track sent email history in MongoDB

---

## 🏗️ Local Architecture & Data Flow

```text
[ Browser: http://localhost:3000 ]
        │
        │ HTTP (Vite Proxy: /api/* ➔ localhost:5000)
        ▼
[ Local Node.js Express Backend (:5000) ]
        │
        ├── 1. Reads/Writes Notes & Sent Email Logs ➔ Local MongoDB (:27017)
        │
        ├── 2. Uploads File/Image Attachments ➔ AWS S3 Bucket
        │      └── Uses AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY from .env
        │
        └── 3. Dispatches Real Emails ➔ AWS SES (Simple Email Service)
               └── Delivers to recipient's inbox & logs to MongoDB
```

---

## 🔑 IAM Configuration for Local Machine (Detailed Guide)

### Why an IAM User instead of an IAM Role?
* **On AWS EC2**: The instance automatically gets temporary credentials from its attached **IAM Role**.
* **On your Local Machine (Windows)**: Your computer is outside AWS, so it needs an **IAM User** with an **Access Key ID** and **Secret Access Key**.

---

### Step-by-Step: Create IAM User & Access Keys

1. Open the **AWS Management Console** ➔ search for **IAM** ➔ click on **Users** in the left sidebar.
2. Click the orange **Create user** button.
3. **User name**: e.g., `notes-app-local-developer`.
4. Leave *"Provide user access to the AWS Management Console"* **unchecked** (we only need programmatic API access).
5. Click **Next**.

#### Set Permissions:
6. Under **Permission options**, select **Attach policies directly**.
7. In the search box, search and check:
   * **`AmazonS3FullAccess`** (to upload files to S3)
   * **`AmazonSESFullAccess`** (to send emails via SES)
8. Click **Next** ➔ click **Create user**.

#### Generate Access Key & Secret Key:
9. Click on the user you just created (`notes-app-local-developer`).
10. Click on the **Security credentials** tab.
11. Scroll down to **Access keys** ➔ click **Create access key**.
12. Under Use case, select **Local code** (check the confirmation box) ➔ click **Next**.
13. Click **Create access key**.
14. **Copy both values** (or download the `.csv` file):
    * `Access key ID` (starts with `AKIA...`)
    * `Secret access key` (long secret string)

---

## ✉️ Amazon SES: Verify Your Sender Email (No Domain Needed!)

1. In AWS Console, search for **Amazon SES** (Simple Email Service).
2. Set your AWS Region to **Mumbai (`ap-south-1`)** or **N. Virginia (`us-east-1`)**.
3. In the left sidebar, click **Identities** (under *Configuration*).
4. Click **Create identity**.
5. Select **Email address** *(not Domain)*.
6. Enter your personal email (e.g. `yourname@gmail.com`).
7. Click **Create identity**.
8. Check your email inbox and click the verification link sent by AWS.
   *(Its status in the SES console will immediately turn green: **Verified**)*.

> 💡 **SES Sandbox Testing**: If your AWS account is in SES Sandbox mode, verify the recipient's email in the same way (or verify a second email address) so you can send test emails between them!

---

## ⚙️ Local Configuration (`backend/.env`)

In your project root, open or create `backend/.env` with your actual values:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/notesdb
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIA...your_access_key...
AWS_SECRET_ACCESS_KEY=your_secret_access_key...
S3_BUCKET_NAME=your-s3-bucket-name
SES_SENDER_EMAIL=your-verified-email@gmail.com
```

---

## 🚀 How to Run Locally

### Option 1: Run Both with One Command (Recommended)
From the project root directory:
```bash
npm run dev
```
* **Frontend App**: [http://localhost:3000](http://localhost:3000)
* **Backend API**: [http://localhost:5000](http://localhost:5000)

---

### Option 2: Run in Separate Terminals

**Terminal 1 (Backend):**
```bash
cd backend
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

---

## ✨ Features Available in the UI

1. **Notes & S3 Attachments**:
   * Create notes with title, description, and attached images/files.
   * Attachments upload to **AWS S3** and direct URLs are stored in **local MongoDB**.
   * One-click **"✉️ Share"** button to pre-fill an email with the note and S3 attachment!

2. **AWS SES Email Hub**:
   * Send real emails to any recipient via Amazon SES.
   * Automatically formats rich HTML with note content and file links.
   * **Sent Emails History Log**: Every email sent by anyone is recorded in MongoDB and displayed on the dashboard with timestamps and delivery status!
