-- Supabase Database Schema for STX Advisor

-- Enable Row Level Security
ALTER TABLE IF EXISTS user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tax_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_deductions ENABLE ROW LEVEL SECURITY;

-- User Profiles Table
CREATE TABLE IF NOT EXISTS user_profiles (
    id TEXT PRIMARY KEY,
    email TEXT,
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tax Filings Table
CREATE TABLE IF NOT EXISTS tax_filings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    gross_income DECIMAL(10,2) NOT NULL,
    income_tax_paid DECIMAL(10,2) NOT NULL,
    employer TEXT NOT NULL,
    full_name TEXT NOT NULL,
    taxable_income DECIMAL(10,2),
    refund DECIMAL(10,2),
    deductions JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, year)
);

-- User Deductions Table
CREATE TABLE IF NOT EXISTS user_deductions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    details TEXT,
    year INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tax_filings_user_id ON tax_filings(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_filings_year ON tax_filings(year);
CREATE INDEX IF NOT EXISTS idx_user_deductions_user_id ON user_deductions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_deductions_year ON user_deductions(year);

-- Row Level Security Policies

-- User Profiles: Users can only access their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid()::text = id);

CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid()::text = id);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid()::text = id);

-- Tax Filings: Users can only access their own filings
CREATE POLICY "Users can view own tax filings" ON tax_filings
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own tax filings" ON tax_filings
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own tax filings" ON tax_filings
    FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own tax filings" ON tax_filings
    FOR DELETE USING (auth.uid()::text = user_id);

-- User Deductions: Users can only access their own deductions
CREATE POLICY "Users can view own deductions" ON user_deductions
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own deductions" ON user_deductions
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own deductions" ON user_deductions
    FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own deductions" ON user_deductions
    FOR DELETE USING (auth.uid()::text = user_id);

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_user_profiles_updated_at 
    BEFORE UPDATE ON user_profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_filings_updated_at 
    BEFORE UPDATE ON tax_filings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 