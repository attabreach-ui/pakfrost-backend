# PAKFROST WMS — Local Setup Guide

## Requirements
- Node.js 20+
- npm
- PostgreSQL (Supabase already configured in .env)

---

## Step 1 — Backend Setup

```bash
cd pakfrost-backend

# Install dependencies
npm install

# Generate Prisma client (zaroor karo pehli baar)
npm run db:generate

# Database migrate (pehli baar ya schema change ke baad)
npm run db:migrate

# Admin user seed karo (sirf pehli baar)
npm run db:seed

# Development server start karo
npm run dev
```

Backend chal jayega: **http://localhost:3001**
Health check: **http://localhost:3001/health**

---

## Step 2 — Frontend Setup

```bash
cd pakfrost-frontend

# Install dependencies
npm install

# Development server start karo
npm run dev
```

Frontend chal jayega: **http://localhost:3000**

---

## Default Login

| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `Admin@123`|

*(Seed file mein jo password set hai)*

---

## Dono ek saath chalane ke liye

Do alag terminals kholo:

**Terminal 1 (Backend):**
```bash
cd pakfrost-backend && npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd pakfrost-frontend && npm run dev
```

---

## Agar koi masla aaye

### "Cannot connect to server" error
- Backend chal raha hai? `http://localhost:3001/health` browser mein check karo
- Frontend ka `.env.local` mein `VITE_API_URL=http://localhost:3001/api/v1` hona chahiye

### Database error
```bash
cd pakfrost-backend
npm run db:generate   # Prisma client regenerate karo
npm run db:migrate    # Migrations run karo
```

### Port already in use
```bash
# Backend port 3001 free karo
npx kill-port 3001

# Frontend port 3000 free karo
npx kill-port 3000
```
