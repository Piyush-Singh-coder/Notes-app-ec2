# 3-Tier Cloud Architecture on AWS EC2 (College Project)

A full-stack **Notes Application** deployed across a classic **3-Tier Architecture** using **3 separate AWS EC2 instances**:
1. **Presentation Tier (Frontend)**: React (Vite) + Nginx Web Server on EC2 Instance #1.
2. **Application Tier (Backend)**: Node.js Express REST API + PM2 on EC2 Instance #2.
3. **Database Tier (Database)**: MongoDB Database Server on EC2 Instance #3.

---

## 🏗️ 3-Tier Architecture Diagram & Request Flow

```text
               [ Public Internet / User Browser ]
                               │
                               │ HTTP Request (Port 80)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Tier 1: Frontend EC2 Instance                              │
│  • Public IP: Yes                                           │
│  • Security Group: frontend-sg (Allows Port 80 from 0.0.0.0)│
│  • Web Server: Nginx                                        │
│  • Serves React build from /                                │
│  • Reverse-proxies /api/* to Backend EC2 Private IP:5000    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ VPC Private Network (Port 5000)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Tier 2: Backend EC2 Instance                               │
│  • Public IP: Yes (for SSH) / Private IP for communication  │
│  • Security Group: backend-sg (Allows Port 5000 ONLY from   │
│    frontend-sg)                                             │
│  • Process Manager: PM2                                     │
│  • Runtime: Node.js + Express REST API                      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ VPC Private Network (Port 27017)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Tier 3: Database EC2 Instance                              │
│  • Security Group: database-sg (Allows Port 27017 ONLY      │
│    from backend-sg)                                         │
│  • Database: MongoDB (bindIp: 0.0.0.0)                      │
│  • Isolated from public internet traffic                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛡️ AWS Security Groups Configuration

Configure 3 Security Groups in the AWS EC2 Console:

### 1. `frontend-sg` (Attached to Frontend EC2)
| Type | Port | Source | Description |
| :--- | :--- | :--- | :--- |
| **SSH** | `22` | `My IP` | Admin SSH terminal access |
| **HTTP** | `80` | `0.0.0.0/0` | Public web traffic for visitors |

### 2. `backend-sg` (Attached to Backend EC2)
| Type | Port | Source | Description |
| :--- | :--- | :--- | :--- |
| **SSH** | `22` | `My IP` | Admin SSH terminal access |
| **Custom TCP** | `5000` | `frontend-sg` (Security Group ID) | Accepts API calls **only** from Frontend EC2 |

### 3. `database-sg` (Attached to Database EC2)
| Type | Port | Source | Description |
| :--- | :--- | :--- | :--- |
| **SSH** | `22` | `My IP` | Admin SSH terminal access |
| **Custom TCP** | `27017` | `backend-sg` (Security Group ID) | Accepts DB queries **only** from Backend EC2 |

---

## 🚀 Setup Instructions for the 3 EC2 Instances

### 🖥️ Step 1: Setup EC2 Instance #3 (Database - MongoDB)

Launch an Ubuntu 22.04/24.04 EC2 instance with `database-sg`. Connect via SSH:

```bash
# 1. Update system packages
sudo apt update -y && sudo apt upgrade -y

# 2. Install MongoDB
sudo apt install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
   sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor --yes
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update -y
sudo apt install -y mongodb-org

# 3. Configure MongoDB to accept connections from the Backend EC2
# Change bindIp from 127.0.0.1 to 0.0.0.0
sudo sed -i 's/bindIp: 127.0.0.1/bindIp: 0.0.0.0/' /etc/mongod.conf

# 4. Start & enable MongoDB service
sudo systemctl daemon-reload
sudo systemctl start mongod
sudo systemctl enable mongod

# 5. Check status
sudo systemctl status mongod
```

> 📌 **Note your Database EC2's Private IP address** (e.g., `172.31.25.10`) from the AWS EC2 Console.

---

### 🖥️ Step 2: Setup EC2 Instance #2 (Backend - Node.js + Express)

Launch an Ubuntu 22.04/24.04 EC2 instance with `backend-sg`. Connect via SSH:

```bash
# 1. Install Node.js 20, Git, and PM2
sudo apt update -y && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
sudo npm install -g pm2

# 2. Clone repository & install dependencies
git clone https://github.com/Piyush-Singh-coder/Notes-app-ec2.git
cd Notes-app-ec2/backend
npm install

# 3. Create .env with the Database EC2's Private IP
# Replace <DB-PRIVATE-IP> with the actual Private IP of Instance #3
cat <<EOT > .env
PORT=5000
MONGODB_URI=mongodb://<DB-PRIVATE-IP>:27017/notesdb
EOT

# 4. Start the backend with PM2
pm2 start server.js --name "notes-backend"
pm2 save
pm2 startup
```

> 📌 **Note your Backend EC2's Private IP address** (e.g., `172.31.18.5`) from the AWS EC2 Console.

---

### 🖥️ Step 3: Setup EC2 Instance #1 (Frontend - React + Nginx)

Launch an Ubuntu 22.04/24.04 EC2 instance with `frontend-sg`. Connect via SSH:

```bash
# 1. Install Node.js 20, Git, and Nginx
sudo apt update -y && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx

# 2. Clone repository & build production React bundle
git clone https://github.com/Piyush-Singh-coder/Notes-app-ec2.git
cd Notes-app-ec2/frontend
npm install
npm run build

# 3. Configure Nginx Reverse Proxy
sudo nano /etc/nginx/sites-available/default
```

Paste the following configuration *(replace `<BACKEND-PRIVATE-IP>` with the actual Private IP of Instance #2)*:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    # Serve compiled React frontend
    location / {
        root /home/ubuntu/Notes-app-ec2/frontend/dist;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls directly to Backend EC2 Private IP
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
# 4. Test and restart Nginx
sudo nginx -t
sudo systemctl restart nginx
```

---

### 🎉 Test Your Deployment
1. Open `http://<FRONTEND-PUBLIC-IP>` in your browser.
2. You will see:
   - **Backend API**: `Connected`
   - **Database Tier**: `MongoDB Connected (EC2)`
3. Create a note, refresh the page, or delete notes to see persistent storage in MongoDB across the 3 EC2 instances!
