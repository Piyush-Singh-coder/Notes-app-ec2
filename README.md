# 3-Tier Notes App (React Frontend EC2 + Node.js Backend EC2 + AWS DynamoDB)

A full-stack, cloud-native **Notes Application** deployed across a 3-tier architecture:
1. **Presentation Tier (Frontend)**: React (Vite) hosted on an EC2 instance with Nginx.
2. **Application Tier (Backend)**: Node.js Express REST API hosted on an EC2 instance with PM2.
3. **Data Tier (Database)**: AWS DynamoDB (fully managed, serverless NoSQL database).

---

## 🏗️ Architecture & Request Flow

```text
[ User's Web Browser ]
        │
        │ HTTP (Port 80)
        ▼
┌─────────────────────────────────┐
│       Frontend EC2 Instance     │
│   • Nginx Reverse Proxy (:80)   │
│   • React Production Build      │
└───────────────┬─────────────────┘
                │
                │ HTTP Proxy: /api/* ➔ Backend Private IP (:5000)
                ▼
┌─────────────────────────────────┐
│       Backend EC2 Instance      │
│   • Node.js + Express (:5000)   │
│   • PM2 Process Manager         │
│   • IAM Role (DynamoDB Access)  │
└───────────────┬─────────────────┘
                │
                │ AWS SDK (HTTPS)
                ▼
┌─────────────────────────────────┐
│          AWS DynamoDB           │
│   • Table: Notes                │
│   • Partition Key: id (String)  │
└─────────────────────────────────┘
```

---

## ❓ EC2 for Database vs. DynamoDB: Which is better?

| Feature | DynamoDB (Recommended) | Self-Hosted DB on EC2 |
| :--- | :--- | :--- |
| **AWS Free Tier Cost** | **25 GB Free Forever** (does not burn EC2 compute hours) | Running a 3rd EC2 will **exceed the 750 free hours/month limit** and incur charges |
| **Maintenance** | **Zero**. Fully managed by AWS | Manual OS updates, DB configuration, disk monitoring |
| **High Availability** | Replicated across 3 Availability Zones automatically | Single point of failure unless complex clustering is configured |
| **Backups** | Point-in-time recovery & on-demand snapshots | Manual EBS snapshots or DB dump scripts |
| **Security** | Direct IAM Role authentication (no passwords in code) | Requires managing database passwords & network firewalls |

> **Verdict**: For production and cloud best-practice on AWS, **DynamoDB** is far superior. Running a database on an EC2 instance is only advised for academic exercises that specifically test manual Linux database administration.

---

## ⚙️ AWS Setup Guide

### 1. Create the DynamoDB Table
1. Open the **AWS Management Console** ➔ **DynamoDB** ➔ **Tables** ➔ **Create table**.
2. **Table name**: `Notes`
3. **Partition key**: `id` (Type: `String`)
4. **Table class**: Standard
5. **Capacity mode**: On-demand (Free-tier friendly)
6. Click **Create table**.

### 2. Create IAM Role for Backend EC2
1. Go to **IAM** ➔ **Roles** ➔ **Create role**.
2. Trusted entity type: **AWS service**, Use case: **EC2**.
3. Attach policy: `AmazonDynamoDBFullAccess` (or create a least-privilege policy for `Notes` table).
4. Name the role: `EC2-DynamoDB-Notes-Role` and create it.
5. In the EC2 Console, select your **Backend EC2 instance** ➔ **Actions** ➔ **Security** ➔ **Modify IAM role** ➔ Attach `EC2-DynamoDB-Notes-Role`.

---

## 🛡️ Security Group Inbound Rules

### Frontend EC2 Security Group (`frontend-sg`)
| Type | Port Range | Source | Purpose |
| :--- | :--- | :--- | :--- |
| SSH | 22 | My IP | Admin terminal access |
| HTTP | 80 | `0.0.0.0/0` | Public access to React UI |

### Backend EC2 Security Group (`backend-sg`)
| Type | Port Range | Source | Purpose |
| :--- | :--- | :--- | :--- |
| SSH | 22 | My IP | Admin terminal access |
| Custom TCP | 5000 | `frontend-sg` (or VPC CIDR) | Accepts requests **only from Frontend EC2** |

---

## 💻 Commands to Run on EC2 Instances

### 🖥️ Backend EC2 Instance Setup

```bash
# 1. Update system & install Node.js 20 & Git
sudo apt update -y && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
sudo npm install -g pm2

# 2. Clone repository & install backend dependencies
git clone https://github.com/Piyush-Singh-coder/Notes-app-ec2.git
cd Notes-app-ec2/backend
npm install

# 3. Configure environment variables (specify your AWS Region)
echo "PORT=5000" >> .env
echo "AWS_REGION=us-east-1" >> .env
echo "DYNAMODB_TABLE_NAME=Notes" >> .env

# 4. Start backend with PM2
pm2 start server.js --name "notes-backend"
pm2 save
pm2 startup
```

---

### 🖥️ Frontend EC2 Instance Setup

```bash
# 1. Update system & install Node.js 20, Git & Nginx
sudo apt update -y && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx

# 2. Clone repository & build frontend
git clone https://github.com/Piyush-Singh-coder/Notes-app-ec2.git
cd Notes-app-ec2/frontend
npm install
npm run build

# 3. Configure Nginx Reverse Proxy to point to Backend Private IP
sudo nano /etc/nginx/sites-available/default
```

Paste the following Nginx configuration (replace `<BACKEND-PRIVATE-IP>` with the private IP of your Backend EC2 instance):

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    # Serve static React frontend files
    location / {
        root /home/ubuntu/Notes-app-ec2/frontend/dist;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls directly to the Backend EC2 private IP
    location /api/ {
        proxy_pass http://<BACKEND-PRIVATE-IP>:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# 4. Test & Restart Nginx
sudo nginx -t
sudo systemctl restart nginx
```

🎉 Open `http://<FRONTEND-PUBLIC-IP>` in your browser!
