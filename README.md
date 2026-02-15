# NFT Gallery App

A React-based NFT gallery application with Supabase backend integration.

## Security Configuration

This application follows security best practices to protect sensitive data:

### Environment Variables
- All sensitive credentials are stored in environment variables
- The `.env.example` file provides a template without actual credentials
- **Never commit actual `.env` files to version control** - they are git-ignored

### Security Features Implemented:
- ✅ Git ignored: `.env*` files, Supabase temp directories, and edge function environment files
- ✅ Hardcoded credentials have been removed from source code
- ✅ Supabase client requires environment variables to function properly
- ✅ WalletConnect configuration fails gracefully when environment variables are missing
- ✅ Edge functions properly use environment variables for Supabase service role key

### Setup Instructions

1. **Copy environment template:**
   ```bash
   cp .env.example .env.local
   ```

2. **Configure your environment variables in `.env.local`:**
   ```bash
   # Supabase Configuration
   # Get these from your Supabase Project Settings -> API
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here

   # WalletConnect Configuration  
   # Get this from https://cloud.walletconnect.com
   VITE_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id-here
   ```

3. **Install dependencies and run the development server:**
   ```bash
   npm install
   npm run dev
   ```

### Required Backend Setup

#### Supabase Edge Functions
This app uses Supabase Edge Functions. After deploying your Supabase project:

1. Navigate to the Edge Functions section in your Supabase dashboard
2. Deploy each function from the `supabase/functions/` directory

#### Edge Function Secrets
Edge functions automatically have access to Supabase environment variables. No manual secret configuration is needed.

#### Database Schema
You'll need to create the required database tables (like `panel_locks`) with proper Row Level Security (RLS) policies.

### Security Checklist Before Going Public

- [ ] Remove any existing `.env` files containing real credentials
- [ ] Verify `.gitignore` correctly excludes sensitive files
- [ ] Test that the app fails gracefully when environment variables are missing
- [ ] Ensure all third-party services are configured with appropriate API keys
- [ ] Confirm database has proper Row Level Security policies

## Development

This is a React application using:
- TypeScript
- Tailwind CSS
- Supabase (backend)
- Vite (build tool)

### Available Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build