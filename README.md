# AWS Cloud Architecture Notes App (React EC2 + Express EC2 + DynamoDB + S3)

A cloud-native **Notes Application** deployed on AWS:
1. **Frontend Tier (Web Server)**: React (Vite) + Nginx on EC2 Instance #1.
2. **Backend Tier (Application Logic)**: Node.js Express REST API on EC2 Instance #2.
3. **Database Tier (Serverless NoSQL)**: AWS DynamoDB (Table: `Notes`).
4. **Storage Tier (Object Storage)**: AWS S3 (Bucket for file/image attachments).

---

## 🏗️ Architecture Diagram

```text
               [ Public Internet / User's Browser ]
                                │
                                │ 1. HTTP Request (Port 80)
                                ▼
┌─────────────────────────────────────────────────────────────┐
│  Tier 1: Frontend EC2 Instance                              │
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
│  • Streams file buffer to AWS S3                            │
│  • Stores note record & S3 fileUrl directly in DynamoDB     │
│  • Uses IAM Role attached to EC2 for AWS authorization      │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               │ 3. Upload File               │ 4. PutItem / ScanItem
               ▼                              ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│  Storage: AWS S3 Bucket      │ │  Database: AWS DynamoDB     │
│  • Stores uploaded files     │ │  • Table: Notes             │
│  • Serves direct HTTPS URLs  │ │  • Partition Key: id (S)    │
└──────────────────────────────┘ └─────────────────────────────┘
```

---

## 🛑 Step 1: Stop the Database EC2 Instance
Since we are using **AWS DynamoDB**, you no longer need the MongoDB EC2 instance running. Stopping it prevents consuming EC2 hours!

1. In the **AWS EC2 Console**, go to **Instances**.
2. Select your **Database EC2 instance**.
3. Click **Instance state** ➔ **Stop instance**.
*(Do NOT terminate if you want to keep its disk for college submission; just Stop it so it stops billing compute hours).*

---

## ⚡ Step 2: Create the DynamoDB Table

1. Open the **AWS Management Console** and search for **DynamoDB**.
2. In the left navigation, click on **Tables** ➔ click the orange **Create table** button.
3. Configure the table:
   * **Table name**: `Notes`
   * **Partition key**: `id`
   * **Data type**: `String`
   * **Table class**: `DynamoDB Standard`
   * **Capacity mode**: Select **On-demand** (recommended, automatically scales and fits AWS Free Tier).
4. Scroll down and click **Create table**.

---

## 🔐 Step 3: Check IAM Role for Backend EC2

Your Backend EC2 needs permission for both **DynamoDB** and **S3**.

1. Go to **IAM Console** ➔ **Roles** ➔ click on your Backend role (e.g. `EC2-S3-Backend-Role` or `EC2-DynamoDB-Notes-Role`).
2. Under the **Permissions** tab, ensure you have these policies attached:
   * **`AmazonDynamoDBFullAccess`** *(or `AmazonDynamoDBFullAccesswithDataPipeline`)*
   * **`AmazonS3FullAccess`**
3. If any is missing:
   * Click **Add permissions** ➔ **Attach policies**.
   * Search for `AmazonDynamoDBFullAccess` and attach it.
   * Search for `AmazonS3FullAccess` and attach it.
4. Verify this IAM role is attached to your **Backend EC2 instance**:
   * In **EC2 Console** ➔ select Backend EC2 ➔ **Actions** ➔ **Security** ➔ **Modify IAM role**.

---

## 💻 Step 4: Update Your EC2 Instances

### 🖥️ Update Backend EC2
SSH into your **Backend EC2**:
```bash
# 1. Pull latest code from GitHub
cd ~/Notes-app-ec2
git pull origin main

# 2. Update backend dependencies
cd backend
npm install

# 3. Update .env file for DynamoDB and S3
cat <<EOT > .env
PORT=5000
AWS_REGION=ap-south-1
DYNAMODB_TABLE_NAME=Notes
S3_BUCKET_NAME=your-s3-bucket-name
EOT

# 4. Restart backend process
pm2 restart notes-backend
```

Check the logs:
```bash
pm2 logs notes-backend
```
*(You will see: `AWS Region: ap-south-1`, `DynamoDB Table: Notes`, `S3 Bucket: your-s3-bucket-name`)*

---

### 🖥️ Update Frontend EC2
SSH into your **Frontend EC2**:
```bash
# 1. Pull latest code from GitHub
cd ~/Notes-app-ec2
git pull origin main

# 2. Recompile React production build
cd frontend
npm install
npm run build

# 3. Reload Nginx
sudo systemctl restart nginx
```

---

### 🎉 Test Your Complete Cloud Application!
1. Open `http://<YOUR-FRONTEND-PUBLIC-IP>` in your browser.
2. The UI header will show:
   * **Backend API**: `Connected`
   * **Database Tier**: `DynamoDB Connected (Notes)`
   * **S3 Storage**: `Configured (your-s3-bucket-name)`
3. Create a note with an image/file attached:
   * The file uploads to **S3**.
   * The note details and S3 URL are written into **DynamoDB**.
   * The item displays in real-time in the React UI!
