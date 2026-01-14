// scripts/import-reviews.js
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync'; // Run: npm install csv-parse

// 1. Setup Environment
dotenv.config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; 

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing API Keys in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 2. Configuration: List ALL your CSV files here
const ORDER_FILES = [
  'EtsySoldOrderItems2025.csv',
  'EtsySoldOrderItems2026.csv'
];
const REVIEWS_FILE = 'etsy-reviews.json';

async function importReviews() {
  console.log("📦 Starting Multi-Year Import...");

  // A. Create the "Master Map" (Order ID -> Product Name)
  const orderToItemMap = {};
  let totalOrdersLoaded = 0;

  for (const fileName of ORDER_FILES) {
    const filePath = path.join(__dirname, fileName);
    
    if (!fs.existsSync(filePath)) {
      console.warn(`   ⚠️ Warning: Could not find ${fileName}. Skipping.`);
      continue;
    }

    console.log(`   Reading ${fileName}...`);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    try {
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      records.forEach(row => {
        const id = row['Order ID'];
        const title = row['Item Name'];
        if (id && title) {
          orderToItemMap[id] = title;
        }
      });
      totalOrdersLoaded += records.length;
    } catch (err) {
      console.error(`   ❌ Error parsing ${fileName}: ${err.message}`);
    }
  }

  console.log(`   ✅ Mapped ${Object.keys(orderToItemMap).length} unique orders from ${totalOrdersLoaded} rows.`);

  // B. Load Reviews
  const reviewsPath = path.join(__dirname, REVIEWS_FILE);
  if (!fs.existsSync(reviewsPath)) {
    console.error(`❌ Could not find ${REVIEWS_FILE}`);
    process.exit(1);
  }

  const reviews = JSON.parse(fs.readFileSync(reviewsPath, 'utf-8'));
  console.log(`🚀 Processing ${reviews.length} reviews...`);

  let success = 0;
  let skipped = 0;

  for (const review of reviews) {
    const orderId = review.order_id?.toString();
    
    // 1. Lookup Product Name using the Map
    const fullProductName = orderToItemMap[orderId];

    if (!fullProductName) {
      console.log(`   ⚠️ Skipped: Order #${orderId} not found in CSVs.`);
      skipped++;
      continue;
    }

    // 2. Fuzzy Match in Supabase (First 15 chars)
    // "Cute Miffy Case..." -> matches "Cute Miffy Case" in DB
    const searchTerm = fullProductName.substring(0, 15);

    const { data: products } = await supabase
      .from('products')
      .select('id, title')
      .ilike('title', `%${searchTerm}%`)
      .limit(1);

    if (!products || products.length === 0) {
      console.log(`   ⚠️ No DB Match: "${fullProductName.substring(0, 30)}..."`);
      skipped++;
      continue;
    }

    // 3. Insert Review
    const { error } = await supabase
      .from('reviews')
      .insert({
        product_id: products[0].id,
        user_name: review.reviewer || "Etsy Customer",
        rating: review.star_rating,
        comment: review.message,
        created_at: new Date(review.date_reviewed).toISOString(),
      });

    if (error) {
      console.error(`   ❌ DB Error: ${error.message}`);
    } else {
      console.log(`   ✅ Linked: 5★ for "${products[0].title}"`);
      success++;
    }
  }

  console.log(`\n🎉 IMPORT COMPLETE! Success: ${success}, Skipped: ${skipped}`);
}

importReviews();