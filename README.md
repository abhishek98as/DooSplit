# DooSplit - Full Stack Expense Tracking Application

A modern expense tracking and management web application built with Next.js 14, TypeScript, MongoDB, and Tailwind CSS.

## 🚀 Current Progress

### ✅ Phase 0: Project Setup & Foundation (COMPLETED)

- [x] Next.js 14 project with TypeScript
- [x] Tailwind CSS design system configured
  - Custom color palette (Primary: #00B8A9, Coral: #FF6B6B, Success: #51CF66)
  - Typography scale with Inter font
  - Responsive spacing and sizing system
  - Dark mode support configured
- [x] MongoDB connection utility with Mongoose
- [x] Environment variables configured
- [x] Base UI component library
  - Button (primary, secondary, destructive, ghost variants)
  - Input (with label, error, helper text support)
  - Card (with header, title, content components)
  - Modal (responsive with overlay)
  - LoadingSpinner
- [x] Responsive layout shell
  - Desktop sidebar navigation
  - Mobile bottom navigation with FAB
  - AppShell wrapper component

## 📦 Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript
- **Styling**: Tailwind CSS
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: NextAuth.js (ready to configure)
- **Icons**: Lucide React
- **State Management**: Zustand (installed, ready to use)

## 🛠️ Installation & Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Splitwise
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Copy `.env.example` to `.env.local` and fill in your values:
   ```env
   MONGODB_URI=your_mongodb_connection_string
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your_secret_key
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open the application**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
Splitwise/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── dashboard/          # Dashboard page
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Root page (redirects to dashboard)
│   │   └── globals.css         # Global styles
│   ├── components/
│   │   ├── layout/             # Layout components
│   │   │   ├── AppShell.tsx    # Main app wrapper
│   │   │   ├── Sidebar.tsx     # Desktop navigation
│   │   │   └── MobileNav.tsx   # Mobile bottom nav
│   │   └── ui/                 # Reusable UI components
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Card.tsx
│   │       ├── Modal.tsx
│   │       └── LoadingSpinner.tsx
│   └── lib/
│       └── db.ts               # MongoDB connection utility
├── tailwind.config.ts          # Tailwind configuration
├── tsconfig.json               # TypeScript configuration
└── package.json                # Dependencies
```

## 🎨 Design System

### Colors

- **Primary**: #00B8A9 (Teal)
- **Coral**: #FF6B6B (For debts/owed amounts)
- **Success**: #51CF66 (For positive balances)
- **Error**: #EF4444
- **Warning**: #F59E0B
- **Info**: #3B82F6

### Typography

- **Font Family**: Inter (sans-serif)
- **Monospace**: JetBrains Mono (for amounts)
- **Sizes**: h1 (28px), h2 (24px), h3 (20px), h4 (18px), body (14px)

### Components

All components follow the design specifications with:
- Minimum touch target: 44x44px
- Consistent border radius: 8px (md), 12px (lg)
- Responsive sizing for mobile and desktop
- Dark mode support

## 📋 Next Steps

### Phase 1: MVP Core Features (In Progress)

#### 1.1 Authentication System
- [ ] Create User model (Mongoose schema)
- [ ] Configure NextAuth.js
- [ ] Build registration page with validation
- [ ] Build login page
- [ ] Implement password reset flow
- [ ] Add email verification
- [ ] Optional: Add OAuth (Google, Facebook)

#### 1.2 User Profile Management
- [ ] Create profile API routes
- [ ] Build profile edit page
- [ ] Add avatar upload (Cloudinary integration)
- [ ] Currency preference selector
- [ ] Account settings page

#### 1.3 Friends Management
- [ ] Create Friend model
- [ ] Build friends list page
- [ ] Add friend search and request system
- [ ] Friend acceptance workflow
- [ ] View friend profile and transaction history

#### 1.4 Expense Management
- [ ] Create Expense and ExpenseParticipant models
- [ ] Build add expense form
- [ ] Implement split calculation utilities
- [ ] Create expense list with filters
- [ ] Edit/delete expense functionality
- [ ] Receipt image upload

#### 1.5 Dashboard & Balances
- [ ] Build balance calculation logic
- [ ] Create dashboard with balance summary
- [ ] "You Owe" and "You're Owed" lists
- [ ] Recent activity feed
- [ ] Quick stats cards

#### 1.6 Settlement Recording
- [ ] Create Settlement model
- [ ] Build settle up modal
- [ ] Record payment functionality
- [ ] Settlement history view
- [ ] Optimal settlement suggestions

## 🔧 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## 📝 Environment Variables

Required environment variables (see `.env.example`):

- `MONGODB_URI` - MongoDB connection string
- `NEXTAUTH_URL` - Application URL
- `NEXTAUTH_SECRET` - Secret for NextAuth.js

Optional:
- OAuth provider credentials (Google, Facebook)
- Cloudinary credentials (for image uploads)
- Email service API keys (for notifications)

## 🎯 Features Roadmap

### Phase 1 (MVP) - Weeks 2-5
- Authentication & user management
- Friends system
- Basic expense tracking
- Settlements
- Dashboard

### Phase 2 (Enhanced) - Weeks 6-9
- Groups functionality
- Advanced split options
- Analytics & charts
- Notifications
- Excel export

### Phase 3 (Polish) - Weeks 10-14
- Admin panel
- Multi-currency support
- Recurring expenses
- PWA & offline support
- Dark mode toggle

## 🤝 Contributing

This is a learning/portfolio project. Feel free to fork and experiment!

## 📄 License

MIT License - feel free to use this for learning purposes.

---

**Built with ❤️ using Next.js 14, TypeScript, MongoDB, and Tailwind CSS**
