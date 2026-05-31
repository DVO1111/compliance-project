import { supabase } from './src/lib/supabase';

// Is insert parameter 'never'?
const t0 = supabase.from('grc_frameworks');
type InsertType = Parameters<typeof t0.insert>[0];

const t1 = supabase.from('content_submissions');
type InsertType2 = Parameters<typeof t1.insert>[0];

// Let's force a type error to inspect the type!
const check1: InsertType = 'EXPECT_COMPILE_ERROR_TO_PRINT_TYPE' as any;
const check2: InsertType2 = 'EXPECT_COMPILE_ERROR_TO_PRINT_TYPE2' as any;

console.log('done');
