require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { initFirebase } = require('./config/firebase');
const { runDueRecurringExpenses } = require('./utils/recurringScheduler');

const PORT = process.env.PORT || 5000;
const RECURRING_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly is plenty for weekly-or-slower cycles

const start = async () => {
  try {
    await connectDB();
    initFirebase();
    app.listen(PORT, () => {
      console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    });

    if (process.env.NODE_ENV !== 'test') {
      // Catch up anything due while the server was down, then keep checking.
      runDueRecurringExpenses().catch((err) =>
        console.error('[recurring] startup run failed:', err.message)
      );
      setInterval(() => {
        runDueRecurringExpenses().catch((err) =>
          console.error('[recurring] scheduled run failed:', err.message)
        );
      }, RECURRING_CHECK_INTERVAL_MS);
    }
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

start();

// Safety net for unhandled rejections.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
