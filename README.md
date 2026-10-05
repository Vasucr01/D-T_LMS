# Course Enrollment & Payment Website

A complete, production-ready **Course Enrollment & Payment Website** built using **Node.js, Express.js, Razorpay**, and **Excel (`.xlsx`) data storage**, visually styled after [DT Careers](https://dtcareers.co.in/en/).

---

## 🌟 Key Features

* **Visual & Modern UI/UX**: Inspired by DT Careers color palette, typography (Inter & Poppins), responsive navbar, cards, and micro-interactions.
* **10-Field Registration Form**: Name, Email, WhatsApp (+91 validation), College/School, Stream, Specialization, Semester, Course selection, Promo Code, Terms acceptance.
* **Dynamic Promo Codes**: Supports percentage (`WELCOME10`), flat rate discounts (`FLAT100`, `EARLYBIRD`), and immediate live price calculations.
* **Server-Side Truth**: All prices, promo discounts, and Razorpay HMAC SHA256 signatures are calculated and verified strictly on the backend.
* **Secure Excel Data Persistence**: Saves verified registrations to `./data/registrations.xlsx` (outside public access) with unique sequential IDs (`REG-2026-0001`).
* **Automated Redirect**: Displays successful registration details with a 3-second countdown timer before redirecting to `https://www.gyanteerthlearning.online/login/`.
* **Out-of-the-Box Demo/Test Support**: Built-in mock test mode allowing instant local testing without needing live Razorpay keys right away.

---

## 📁 Project Structure

```text
d&t/
├── public/
│   ├── index.html         # Landing / Course catalog page
│   ├── form.html          # Registration form & checkout summary
│   ├── success.html       # Success page with reg ID & redirect countdown
│   ├── failed.html        # Payment failure retry page
│   ├── terms.html         # Terms & Conditions policy
│   ├── privacy.html       # Privacy Policy page
│   ├── css/
│   │   └── style.css      # Design system & responsive styles
│   ├── js/
│   │   ├── main.js        # Mobile drawer toggle & navigation states
│   │   └── form.js        # Form validation, promo fetch, Razorpay modal
│   └── assets/            # Logos and visual assets
├── routes/
│   ├── payment.js         # Razorpay order creation & HMAC signature verification
│   └── registration.js    # Promo code validation & course catalog API
├── services/
│   ├── razorpay.js        # Razorpay SDK initialization & mock fallback logic
│   └── excel.js           # Excel spreadsheet persistence & ID auto-generation
├── data/
│   └── registrations.xlsx # Excel storage file (gitignored & protected)
├── server.js              # Express app entry, security headers (Helmet), rate limiters
├── package.json           # Dependencies and scripts
├── .env.example           # Environment template
├── .env                   # Active environment variables
├── .gitignore             # Exclusion rules (.env, node_modules, data/*.xlsx)
└── README.md              # Setup and administration guide
```

---

## 🚀 Quick Start Guide

### 1. Installation

Install project dependencies:

```bash
npm install
```

### 2. Configure Environment (`.env`)

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Set your configuration values in `.env`:

```env
PORT=5000

# Razorpay API Keys (Get from https://dashboard.razorpay.com/app/keys)
RAZORPAY_KEY_ID=rzp_test_your_key_id_here
RAZORPAY_KEY_SECRET=your_key_secret_here

# Default Course Price (INR)
DEFAULT_COURSE_PRICE=1000

# Successful Payment Target Redirect URL
SUCCESS_REDIRECT_URL=https://www.gyanteerthlearning.online/login/
```

### 3. Running Locally

#### Development Mode (Auto-reload):

```bash
npm run dev
```

#### Production Mode:

```bash
npm start
```

Visit the website in your browser: `http://localhost:5000`

---

## 💳 Razorpay Setup & Payment Flow

1. Create a free account at [Razorpay Dashboard](https://dashboard.razorpay.com/).
2. Navigate to **Account & Settings** -> **API Keys** -> **Generate Test Key**.
3. Copy `Key ID` and `Key Secret` into your `.env` file.
4. When testing payments in Test Mode, Razorpay provides simulated net banking and UPI test payment methods.
5. **Security Guarantee**: The `RAZORPAY_KEY_SECRET` is used exclusively on the server to verify the `razorpay_signature` HMAC SHA256 hash.

---

## 🏷️ Customizing Promo Codes & Courses

Promo codes and course catalog entries are configured in `routes/registration.js`:

```javascript
// Adding or Editing Promo Codes
const PROMO_CODES = {
  "WELCOME10": { type: "percentage", value: 10, active: true },
  "FLAT100":   { type: "flat",       value: 100, active: true },
  "EARLYBIRD": { type: "flat",       value: 200, active: true },
  "CUSTOM50":  { type: "percentage", value: 50,  active: true }
};
```

---

## 📊 Excel Data Storage (`registrations.xlsx`)

When a payment signature is verified, a row is appended to `data/registrations.xlsx` containing:

| Field | Example |
| :--- | :--- |
| Registration ID | `REG-2026-0001` |
| Full Name | `Vasukumar Chauhan` |
| Email | `example@gmail.com` |
| WhatsApp Number | `9876543210` |
| College / School | `ABC Engineering College` |
| Stream / Class | `Engineering` |
| Specialization | `Computer Science` |
| Semester | `6` |
| Course | `Full Stack Web & GenAI Development` |
| Promo Code | `WELCOME10` |
| Original Amount | `1000` |
| Discount | `100` |
| Final Amount | `900` |
| Razorpay Order ID | `order_xxxxx` |
| Razorpay Payment ID | `pay_xxxxx` |
| Payment Status | `SUCCESS` |
| Payment Date | `2026-09-20 22:30:00` |
| Terms Accepted | `YES` |

> ⚠️ **Note for Cloud Hosting**: On serverless platforms like Render, Vercel, or Heroku, the local filesystem is ephemeral (resets on restart). For cloud deployments, you can easily connect a Google Sheet API or PostgreSQL/MongoDB database in `services/excel.js`.

---

## 🛡️ Security Features

* **Helmet Security Headers**: Configured Content Security Policy for scripts and frames.
* **Rate Limiting**: Protects `/api/` endpoints against DDoS or spamming.
* **Server-side Validation**: Validates Indian mobile numbers, email formats, and required inputs.
* **Idempotency Protection**: Rejects duplicate payment callbacks.

---

## 📜 License

© 2026 D&T Career Planners LLP. All Rights Reserved.
