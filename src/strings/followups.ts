// Strings for the Follow-ups screen: overdue and due-today quote follow-ups, upcoming ones, and buyer reminders.
export const followups = {
  title: 'Follow-ups',
  subtitle: 'Keep every open buyer conversation moving.',
  logContact: 'Log contact',
  overdueTitle: 'Overdue', overdueHint: 'Needs attention first', overdueEmpty: 'No overdue follow-ups.',
  todayTitle: 'Due today', todayHint: 'Quotes awaiting a buyer response', todayEmpty: 'No follow-ups due today.',
  upcomingTitle: 'Upcoming', upcomingHint: 'Scheduled follow-ups for active quotations', upcomingEmpty: 'No upcoming follow-ups are scheduled.',
  buyerTitle: 'Buyer next actions', buyerHint: 'Relationship reminders saved on buyer profiles', buyerEmpty: 'No buyer reminders have been set.',
  daysOverdue: (n: number) => `${n} day${n === 1 ? '' : 's'} overdue`,
  dueToday: (date: string) => `Due today · ${date}`,
  lastNote: (body: string) => ` · Last note: ${body}`,
  draft: 'Draft', quotation: 'Quotation',
  openQuoteAria: (buyer: string) => `Open quotation for ${buyer}`,
  openBuyer: 'Open buyer',
  reviewBuyer: 'Review buyer requirements',
  /** Live mode while GET /dashboard does not exist: the overdue and due-today boxes cannot be filled. */
  dueUnavailable: 'Overdue and due-today quote follow-ups are not available yet.',
};
