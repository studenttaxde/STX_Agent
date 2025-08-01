-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE,
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User tax data table (main table for tax filings)
CREATE TABLE IF NOT EXISTS user_tax_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    tax_year INTEGER NOT NULL,
    gross_income DECIMAL(10,2) DEFAULT 0,
    tax_paid DECIMAL(10,2) DEFAULT 0,
    taxable_income DECIMAL(10,2) DEFAULT 0,
    total_deductions DECIMAL(10,2) DEFAULT 0,
    loss_carryforward_used DECIMAL(10,2) DEFAULT 0,
    loss_carryforward_remaining DECIMAL(10,2) DEFAULT 0,
    estimated_refund DECIMAL(10,2) DEFAULT 0,
    refund_type TEXT CHECK (refund_type IN ('full', 'partial', 'none')) DEFAULT 'none',
    refund_reason TEXT,
    filing_date DATE DEFAULT CURRENT_DATE,
    filing_json JSONB,
    agent_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, tax_year)
);

-- Conversation states table for resuming sessions
CREATE TABLE IF NOT EXISTS conversation_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    state_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Error logging table for monitoring
CREATE TABLE IF NOT EXISTS supabase_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id TEXT,
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    additional_data JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tax filings table (legacy, kept for compatibility)
CREATE TABLE IF NOT EXISTS tax_filings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    gross_income DECIMAL(10,2),
    tax_paid DECIMAL(10,2),
    total_deductions DECIMAL(10,2),
    estimated_refund DECIMAL(10,2),
    filing_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User deductions table (legacy, kept for compatibility)
CREATE TABLE IF NOT EXISTS user_deductions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    category TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_tax_data_user_id ON user_tax_data(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tax_data_year ON user_tax_data(tax_year);
CREATE INDEX IF NOT EXISTS idx_user_tax_data_user_year ON user_tax_data(user_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_conversation_states_conversation_id ON conversation_states(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_states_user_id ON conversation_states(user_id);
CREATE INDEX IF NOT EXISTS idx_supabase_logs_timestamp ON supabase_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_supabase_logs_error_type ON supabase_logs(error_type);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_tax_data_updated_at BEFORE UPDATE ON user_tax_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversation_states_updated_at BEFORE UPDATE ON conversation_states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tax_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE supabase_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_deductions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid()::text = id::text);
CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid()::text = id::text);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid()::text = id::text);

-- RLS Policies for user_tax_data
CREATE POLICY "Users can view own tax data" ON user_tax_data FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert own tax data" ON user_tax_data FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own tax data" ON user_tax_data FOR UPDATE USING (auth.uid()::text = user_id::text);

-- RLS Policies for conversation_states
CREATE POLICY "Users can view own conversation states" ON conversation_states FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert own conversation states" ON conversation_states FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own conversation states" ON conversation_states FOR UPDATE USING (auth.uid()::text = user_id::text);

-- RLS Policies for supabase_logs (read-only for admins, insert for all)
CREATE POLICY "Admins can view logs" ON supabase_logs FOR SELECT USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Anyone can insert logs" ON supabase_logs FOR INSERT WITH CHECK (true);

-- RLS Policies for tax_filings (legacy)
CREATE POLICY "Users can view own tax filings" ON tax_filings FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert own tax filings" ON tax_filings FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own tax filings" ON tax_filings FOR UPDATE USING (auth.uid()::text = user_id::text);

-- RLS Policies for user_deductions (legacy)
CREATE POLICY "Users can view own deductions" ON user_deductions FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert own deductions" ON user_deductions FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own deductions" ON user_deductions FOR UPDATE USING (auth.uid()::text = user_id::text);

-- Create functions for common operations
CREATE OR REPLACE FUNCTION get_user_tax_history(p_user_id UUID)
RETURNS TABLE (
    tax_year INTEGER,
    gross_income DECIMAL(10,2),
    tax_paid DECIMAL(10,2),
    estimated_refund DECIMAL(10,2),
    refund_type TEXT,
    filing_date DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        utd.tax_year,
        utd.gross_income,
        utd.tax_paid,
        utd.estimated_refund,
        utd.refund_type,
        utd.filing_date
    FROM user_tax_data utd
    WHERE utd.user_id = p_user_id
    ORDER BY utd.tax_year DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get loss carryforward for a user and year
CREATE OR REPLACE FUNCTION get_loss_carryforward(p_user_id UUID, p_year INTEGER)
RETURNS TABLE (
    used_amount DECIMAL(10,2),
    remaining_amount DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(utd.loss_carryforward_used, 0),
        COALESCE(utd.loss_carryforward_remaining, 0)
    FROM user_tax_data utd
    WHERE utd.user_id = p_user_id 
    AND utd.tax_year = p_year - 1
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to apply loss carryforward
CREATE OR REPLACE FUNCTION apply_loss_carryforward(
    p_user_id UUID,
    p_year INTEGER,
    p_amount_to_apply DECIMAL(10,2)
)
RETURNS TABLE (
    applied_amount DECIMAL(10,2),
    remaining_amount DECIMAL(10,2)
) AS $$
DECLARE
    available_loss DECIMAL(10,2);
    applied_amount DECIMAL(10,2);
    remaining_amount DECIMAL(10,2);
BEGIN
    -- Get available loss carryforward from previous year
    SELECT COALESCE(loss_carryforward_remaining, 0) INTO available_loss
    FROM user_tax_data
    WHERE user_id = p_user_id AND tax_year = p_year - 1;
    
    -- Calculate amounts
    applied_amount := LEAST(available_loss, p_amount_to_apply);
    remaining_amount := available_loss - applied_amount;
    
    -- Update current year with applied loss
    INSERT INTO user_tax_data (user_id, tax_year, loss_carryforward_used, loss_carryforward_remaining)
    VALUES (p_user_id, p_year, applied_amount, remaining_amount)
    ON CONFLICT (user_id, tax_year)
    DO UPDATE SET
        loss_carryforward_used = EXCLUDED.loss_carryforward_used,
        loss_carryforward_remaining = EXCLUDED.loss_carryforward_remaining,
        updated_at = NOW();
    
    RETURN QUERY SELECT applied_amount, remaining_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert sample data for testing (optional)
-- INSERT INTO user_profiles (id, email, full_name) VALUES 
-- ('550e8400-e29b-41d4-a716-446655440000', 'test@example.com', 'Test User');

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated; 