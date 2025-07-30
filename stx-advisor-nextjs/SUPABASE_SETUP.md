# Supabase Setup Guide for STX Advisor

## Overview
This guide will help you set up Supabase for data persistence in the STX Advisor application. Supabase will store user profiles, tax filings, and deductions to provide a better user experience.

## Prerequisites
- Supabase account (free tier available)
- Access to Supabase dashboard

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up or log in to your account
3. Click "New Project"
4. Choose your organization
5. Enter project details:
   - **Name**: `stx-advisor`
   - **Database Password**: Choose a strong password
   - **Region**: Choose closest to your users
6. Click "Create new project"

## Step 2: Get Project Credentials

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL**: `https://your-project-id.supabase.co`
   - **Anon Public Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## Step 3: Set Up Database Schema

1. In your Supabase dashboard, go to **SQL Editor**
2. Create a new query
3. Copy and paste the contents of `supabase-schema.sql`
4. Click "Run" to execute the schema

## Step 4: Configure Environment Variables

Add the following environment variables to your `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

## Step 5: Update Supabase Configuration

Update the Supabase configuration in `src/lib/supabase.ts`:

```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
```

## Step 6: Test the Setup

1. Start your development server: `npm run dev`
2. Upload a PDF file
3. Complete the tax advisor flow
4. Check your Supabase dashboard → **Table Editor** to see the data

## Database Schema Overview

### Tables

1. **user_profiles**
   - Stores basic user information
   - Uses browser-based user ID for anonymous users

2. **tax_filings**
   - Stores complete tax filing data
   - Includes income, tax paid, deductions, and calculations
   - One filing per user per year

3. **user_deductions**
   - Stores individual deduction entries
   - Used for suggesting common deductions in future years

### Features

- **Data Persistence**: All user data is automatically saved
- **Existing Data Detection**: App checks for previous filings for the same year
- **Deduction Suggestions**: Based on previous years' deductions
- **Anonymous Users**: No authentication required, uses browser fingerprinting

## Security Features

- **Row Level Security (RLS)**: Users can only access their own data
- **Automatic Timestamps**: Created/updated timestamps are managed automatically
- **Data Validation**: Proper data types and constraints

## Troubleshooting

### Common Issues

1. **"Table doesn't exist"**
   - Make sure you've run the schema SQL
   - Check that you're in the correct project

2. **"Permission denied"**
   - Verify RLS policies are enabled
   - Check that the user ID is being generated correctly

3. **"Invalid API key"**
   - Verify your environment variables are set correctly
   - Check that you're using the anon key, not the service role key

### Debug Steps

1. Check browser console for errors
2. Verify Supabase connection in Network tab
3. Check Supabase dashboard logs
4. Test with a simple query in SQL Editor

## Production Deployment

For production deployment:

1. **Environment Variables**: Set the same environment variables in your hosting platform
2. **Database Backups**: Enable automatic backups in Supabase
3. **Monitoring**: Set up alerts for database usage
4. **Performance**: Monitor query performance and add indexes if needed

## Data Privacy

- All data is stored securely in Supabase
- Users are anonymous (no personal information required)
- Data is automatically cleaned up based on your retention policy
- GDPR compliant data handling

## Support

If you encounter issues:

1. Check the Supabase documentation
2. Review the application logs
3. Test with a fresh Supabase project
4. Contact support with specific error messages 