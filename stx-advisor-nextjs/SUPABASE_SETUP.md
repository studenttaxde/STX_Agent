# Supabase Setup Guide for STX Advisor

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note down your project URL and anon key

## 2. Database Setup

### Run the SQL Schema

1. Go to your Supabase dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `supabase-schema.sql` into the editor
4. Click **Run** to execute the schema

### Verify Tables Created

After running the schema, you should see these tables:
- `user_profiles`
- `tax_filings` 
- `user_deductions`

## 3. Environment Variables

Add these to your `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## 4. Row Level Security (RLS)

The schema includes RLS policies that allow anonymous access. This means:
- Users can access data based on their `user_id`
- No authentication required
- Data is isolated per user via `user_id`

## 5. Testing the Setup

1. Start your development server
2. Upload a PDF file
3. Check the browser console for any Supabase errors
4. Verify data is being saved to the database

## 6. Troubleshooting

### Common Issues:

1. **404 Errors**: Make sure the tables exist and RLS policies are correct
2. **Permission Denied**: Check that RLS policies allow anonymous access
3. **Connection Issues**: Verify your Supabase URL and anon key

### Debug Steps:

1. Check browser console for errors
2. Verify environment variables are loaded
3. Test Supabase connection in the browser console:
   ```javascript
   // Test in browser console
   const { data, error } = await supabase.from('user_profiles').select('*').limit(1)
   console.log('Test result:', { data, error })
   ```

## 7. Production Deployment

For production deployment on Netlify:

1. Add the same environment variables to your Netlify dashboard
2. Ensure the database schema is applied to your production Supabase project
3. Test the application after deployment

## 8. Database Schema Overview

### Tables:

- **user_profiles**: Stores user information
- **tax_filings**: Stores tax filing data per year
- **user_deductions**: Stores deduction information

### Key Features:

- Anonymous access via `user_id`
- Automatic timestamps
- Foreign key relationships
- Indexes for performance
- JSONB support for flexible data storage 