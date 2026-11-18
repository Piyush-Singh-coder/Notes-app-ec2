# 3-Tier Cloud Architecture on AWS EC2 + AWS S3 Storage

A full-stack **Notes Application** deployed across a classic **3-Tier Architecture** using **3 separate AWS EC2 instances** with **AWS S3 object storage**:
1. **Presentation Tier (Frontend)**: React (Vite) + Nginx Web Server on EC2 Instance #1.
2. **Application Tier (Backend)**: Node.js Express REST API + PM2 on EC2 Instance #2.
3. **Database Tier (Database)**: MongoDB Server on EC2 Instance #3.
4. **Storage Tier (Object Storage)**: AWS S3 Bucket for attachments and images.

---

## 🏗️ 3-Tier Architecture Diagram & S3 Request Flow

```text
               [ Public Internet / User's Browser ]
                                │
                                │ 1. HTTP Request (Port 80)
                                ▼
┌─────────────────────────────────────────────────────────────┐
│  Tier 1: Frontend EC2 Instance                              │
│  • Public IP: Yes (accessed via browser)                    │
│  • Web Server: Nginx                                        │
│  • Serves React build from /                                │
│  • Reverse-proxies /api/* to Backend EC2 Private IP:5000    │
└──────────────────────────────┬──────────────────────────────┘
                                │
                                │ 2. Multipart Form Upload (/api/notes)
                                ▼
┌─────────────────────────────────────────────────────────────┐
│  Tier 2: Backend EC2 Instance                               │
│  • Node.js Express API running via PM2                      │
│  • Uses multer to stream file buffer to AWS S3              │
│  • Uses IAM Role attached to EC2 for S3 permissions         │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               │ 3. Upload File               │ 4. Save Note & S3 URL
               ▼                              ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│  Storage: AWS S3 Bucket      │ │  Tier 3: Database EC2       │
│  • Bucket: <your-bucket-name>│ │  • MongoDB on port 27017    │
│  • Stores uploaded files     │ │  • Saves { title, content,  │
│  • Generates HTTPS URL       │ │    fileUrl, fileName }      │
└──────────────┬───────────────┘ └─────────────────────────────┘
               │
               │ 5. Browser loads image/file directly via HTTPS
               ▼
   [ User views file in React UI ]
```

---

## 🪣 AWS S3 Setup Guide

### Step 1: Create an S3 Bucket in AWS Console
1. In the AWS Console, search for **S3** ➔ click **Create bucket**.
2. **Bucket name**: Choose a globally unique name (e.g. `notes-app-storage-<yourname>-2026`).
3. **AWS Region**: Select the same region as your EC2 instances (e.g. `ap-south-1` or `us-east-1`).
4. **Block Public Access settings for this bucket**:
   * **Uncheck** "Block *all* public access" (so uploaded images/attachments can be viewed in the browser).
   * Check the acknowledgment box ("I acknowledge that the current settings might result in this bucket and the objects within it becoming public").
5. Click **Create bucket**.

---

### Step 2: Add Bucket Policy for Public Read Access
1. Click on your newly created bucket ➔ go to the **Permissions** tab.
2. Scroll to **Bucket policy** ➔ click **Edit**.
3. Paste the following policy (replace `YOUR-BUCKET-NAME` with your actual bucket name):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
        }
    ]
}
```
4. Click **Save changes**.

---

### Step 3: Attach S3 Permissions to Backend EC2 (IAM Role)
Your Backend EC2 needs permission to upload files to S3 without putting secret access keys into code!

1. Go to **IAM** ➔ **Roles** in AWS Console.
2. Locate the role attached to your Backend EC2 (or create one for EC2 with `AmazonS3FullAccess`).
3. Click **Add permissions** ➔ **Attach policies**.
4. Search for `AmazonS3FullAccess` and attach it.
5. In the **EC2 Console**, ensure this IAM role is attached to your **Backend EC2 instance**:
   * Select Backend EC2 ➔ **Actions** ➔ **Security** ➔ **Modify IAM role** ➔ select the role and save.

---

## 💻 Commands to Update Your EC2 Instances

### 🖥️ Step 1: Update Backend EC2

Connect via SSH to your **Backend EC2 instance**:

```bash
# 1. Pull latest code from GitHub
cd ~/Notes-app-ec2
git pull origin main

# 2. Install new dependencies (@aws-sdk/client-s3, multer)
cd backend
npm install

# 3. Add S3 configuration to your .env file
# (Replace your-bucket-name and ap-south-1 with your actual values)
echo "S3_BUCKET_NAME=your-bucket-name" >> .env
echo "AWS_REGION=ap-south-1" >> .env

# 4. Restart backend with PM2
pm2 restart notes-backend
```

Check the logs to verify:
```bash
pm2 logs notes-backend
```
*(You will see: `Configured S3 Bucket: your-bucket-name`)*

---

### 🖥️ Step 2: Update Frontend EC2

Connect via SSH to your **Frontend EC2 instance**:

```bash
# 1. Pull latest code from GitHub
cd ~/Notes-app-ec2
git pull origin main

# 2. Recompile React production build with S3 file upload support
cd frontend
npm install
npm run build

# 3. Ensure permissions are intact and reload Nginx
sudo chmod 755 /home/ubuntu
sudo chmod -R 755 /home/ubuntu/Notes-app-ec2/frontend/dist
sudo systemctl restart nginx
```

---

### 🎉 Test the S3 Upload!
1. Open `http://<FRONTEND-PUBLIC-IP>` in your browser.
2. The UI header will display:
   * **Backend API**: `Connected`
   * **Database Tier**: `MongoDB Connected (EC2)`
   * **S3 Storage**: `Configured (your-bucket-name)`
3. Create a note, choose an image (PNG/JPG) or document, and click **+ Add Note**.
4. You will see the note rendered with the image preview / file link hosted on AWS S3!
