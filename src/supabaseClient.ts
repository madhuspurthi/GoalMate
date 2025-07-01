import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ajvvbjqdvydrwexoqazx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqdnZianFkdnlkcndleG9xYXp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEzNjIxNTAsImV4cCI6MjA2NjkzODE1MH0.AqXVsI_vmt0sRNKqmFXSKmi0TMBwibfLISf9MvYRBME'

export const supabase = createClient(supabaseUrl, supabaseKey)
