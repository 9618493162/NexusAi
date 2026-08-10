@echo off
echo ⚠️  This will DELETE ALL DATA in your Supabase database!
echo.
echo To reset, go to your Supabase dashboard:
echo   1. Open https://app.supabase.com
echo   2. Select your project
echo   3. Go to SQL Editor
echo   4. Copy/paste the SQL from prisma\reset-supabase.sql
echo   5. Click Run
echo.
echo After resetting, run: npx prisma db push
echo.
pause
