import { createClient } from '@supabase/supabase-js';

// These can be overridden by environment variables in Vercel/production
// Note: Vite requires the VITE_ prefix to expose variables to the client-side code.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://yvigiirlsdbhmmcqvznk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2aWdpaXJsc2RiaG1tY3F2em5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwODg4ODYsImV4cCI6MjA2NzY2NDg4Nn0.o2YAwA8zeQL9lB0WD3vlBJFRZafcjypxlYDwwCQx_U0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);