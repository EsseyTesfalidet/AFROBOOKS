# AFROBOOKS

**Africa's boldest ebook marketplace** — buy, sell, and read African ebooks online.

🌍 **Live app:** [campusconnect-nine-psi.vercel.app](https://campusconnect-nine-psi.vercel.app)

---

## What it is

AFROBOOKS is a full-stack ebook marketplace where African authors can publish and sell their work, and readers can discover, purchase, and read ebooks directly in the browser.

### For readers
- Browse and search ebooks by genre
- Read free sample chapters before buying
- In-browser reader with progress tracking
- Library, wishlist, and purchase history
- Subscription plan for unlimited reading
- Pre-order upcoming releases

### For sellers (authors)
- Publish ebooks with a multi-step editor
- Set chapters as free previews or locked
- Track sales, earnings, and analytics
- Stripe Connect payouts
- Co-author revenue sharing

### Platform
- Admin dashboard for content moderation, user management, and payouts
- Report system for flagging books
- Verified purchase badges on reviews
- Referral program
- PWA — installable on mobile

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| Storage | Firebase Storage |
| Payments | Stripe (one-time + subscriptions + Connect) |
| Email | Resend |
| Hosting | Vercel |
| Background jobs | Firebase Cloud Functions |
| Styling | Tailwind CSS |

---

## Local development

### 1. Clone and install
```bash
git clone https://github.com/EsseyTesfalidet/AFROBOOKS.git
cd AFROBOOKS
npm install
```

### 2. Set up environment variables
Create a `.env.local` file in the root with the following keys:

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
ADMIN_BOOTSTRAP_SECRET=
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=AFROBOOKS
```

### 3. Run the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment

The app is deployed on **Vercel**. To deploy your own instance:

```bash
npm install -g vercel
vercel --prod
```

Firebase Cloud Functions are deployed separately:
```bash
firebase deploy --only functions,firestore,storage
```

---

## Project structure

```
app/
  (admin)/       # Admin dashboard
  (auth)/        # Login & signup
  (buyer)/       # Reader-facing pages
  (seller)/      # Author dashboard
  api/           # API routes (Stripe webhooks, email)
components/
  auth/          # Login & signup forms
  buyer/         # Book cards, reviews, header
  seller/        # Chapter editor, seller header
  shared/        # Reusable UI components
  reader/        # In-browser reader
lib/
  firebase/      # Auth, Firestore, Storage helpers
  stripe/        # Stripe client & server
functions/       # Firebase Cloud Functions
store/           # Zustand global state
types/           # TypeScript types
```

---

## License

MIT
