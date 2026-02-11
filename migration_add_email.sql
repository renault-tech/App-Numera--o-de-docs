-- Migration: Add email column to users table
-- Enable Supabase Auth integration by linking email

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email') THEN 
        ALTER TABLE public.users ADD COLUMN email text;
        -- Opcional: Criar índice para busca rápida
        CREATE INDEX idx_users_email ON public.users(email);
    END IF; 
END $$;
