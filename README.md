# Welcome to your Dyad app

## Security Configuration

This application follows security best practices to protect sensitive data:

### Environment Variables
- All sensitive credentials are stored in environment variables
- The `.env.example` file provides a template without actual credentials
- Never commit actual `.env` files to version control

### Security Features Implemented:
- Git ignored: `.env*` files, Supabase temp directories, and edge function environment files
- Hardcoded credentials have been removed from source code
- Supabase client requires environment variables to function properly
- WalletConnect configuration fails gracefully when environment variables are missing

### Required Environment Variables:
```bash
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id
```
