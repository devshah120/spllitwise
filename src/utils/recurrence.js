// Moves a date forward by one cycle of the given frequency. Used both to
// pick the *next* run date after one fires, and to walk a template forward
// one occurrence at a time when catching up after downtime.
function advance(date, frequency) {
  const d = new Date(date);
  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'fortnightly':
      d.setDate(d.getDate() + 14);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      throw new Error(`Unknown frequency: ${frequency}`);
  }
  return d;
}

module.exports = { advance };
