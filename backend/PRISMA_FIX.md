
# Alternative: Use Prisma Migrate (handles existing tables better)

# Option 1: Create a fresh migration
npx prisma migrate dev --name init

# Option 2: If that fails, reset the database via Supabase dashboard
# Then run:
npx prisma db push

# Option 3: Use Supabase's own reset
# Go to Supabase Dashboard > Settings > Database > Reset Database
