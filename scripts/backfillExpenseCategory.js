// One-time data fix: some expenses were created before the `category`
// field existed on the Expense schema at all, so they have no category
// stored (not even the "Other" default — .lean() reads confirm the field
// is genuinely absent on these documents, not defaulted).
//
// For that era, the app had no separate Title field yet — `description`
// *was* the category label the user picked. So wherever `description`
// still exactly matches one of today's category names, that is not a
// guess: it is the original selection, just living in the wrong field.
// This script moves it into `category`, where it belongs.
//
// It deliberately does NOT touch anything else: an expense whose
// description is a real merchant name / free-text title (so its category
// was never actually recorded anywhere) is left alone — there is nothing
// to safely recover for those, and they need a person to pick the right
// category by hand (e.g. by editing the expense in the app).
//
// Safe by default: running this with no flags only PRINTS what it would
// change. Nothing is written to the database until you pass --apply.
//
// Usage:
//   node scripts/backfillExpenseCategory.js            # dry run (read-only)
//   node scripts/backfillExpenseCategory.js --apply     # actually writes

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Expense = require('../src/models/Expense');

const KNOWN_CATEGORIES = ['Food & drink', 'Travel', 'Accommodation', 'Entertainment', 'Other'];

async function run() {
  const apply = process.argv.includes('--apply');

  await connectDB();

  // .lean() is essential here: a hydrated Mongoose document would apply
  // the schema's `default: 'Other'` for a missing category, hiding exactly
  // the documents this script needs to find.
  const candidates = await Expense.find({ category: { $exists: false } })
    .select('_id description category notes amount date group')
    .lean();

  const recoverable = candidates.filter((e) => KNOWN_CATEGORIES.includes(e.description));
  const skipped = candidates.filter((e) => !KNOWN_CATEGORIES.includes(e.description));

  console.log(`Mode: ${apply ? 'APPLY (will write to the database)' : 'DRY RUN (read-only — pass --apply to write)'}`);
  console.log(`Expenses with no category stored: ${candidates.length}`);
  console.log(`  -> recoverable (description is a category name): ${recoverable.length}`);
  console.log(`  -> needs a manual fix (real title, category was never recorded): ${skipped.length}`);
  console.log('');

  if (recoverable.length) {
    console.log('Recoverable — description will become the category:');
    for (const e of recoverable) {
      console.log(`  [${e._id}] "${e.description}" — Rs.${e.amount} on ${e.date.toISOString().slice(0, 10)}`);
    }
    console.log('');
  }

  if (skipped.length) {
    console.log('NOT touched — fix these by hand (Edit -> pick a category) in the app:');
    for (const e of skipped) {
      console.log(`  [${e._id}] "${e.description}" (notes: "${e.notes || ''}") — Rs.${e.amount} on ${e.date.toISOString().slice(0, 10)}`);
    }
    console.log('');
  }

  if (!apply) {
    console.log('Dry run complete. Re-run with --apply to write these changes.');
  } else if (recoverable.length) {
    let updated = 0;
    for (const e of recoverable) {
      await Expense.updateOne({ _id: e._id }, { $set: { category: e.description } });
      updated++;
    }
    console.log(`Done. Updated ${updated} expense(s).`);
  } else {
    console.log('Nothing to update.');
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
