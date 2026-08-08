import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://jgbtudbialgitdxgkngj.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnYnR1ZGJpYWxnaXRkeGdrbmdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNjgzODksImV4cCI6MjEwMTY0NDM4OX0.1Wc1P4seagQsTKcOKN9nhDDiakBIAnQo7FlHhJBUO8A';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
