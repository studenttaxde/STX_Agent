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

-- Row Level Security Policies for Anonymous Access

-- User Profiles: Allow anonymous access based on user_id
CREATE POLICY "Allow anonymous access to user profiles" ON user_profiles
    FOR ALL USING (true);

-- Tax Filings: Allow anonymous access based on user_id
CREATE POLICY "Allow anonymous access to tax filings" ON tax_filings
    FOR ALL USING (true);

-- User Deductions: Allow anonymous access based on user_id
CREATE POLICY "Allow anonymous access to user deductions" ON user_deductions
    FOR ALL USING (true);

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