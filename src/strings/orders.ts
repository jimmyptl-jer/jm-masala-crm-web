// Strings for the Orders screen (won quotations ready for handoff).
export const orders = {
  title: 'Orders',
  subtitle: 'Won business ready for order handoff.',
  note: 'This list is based on won quotations. Order fulfillment and shipment statuses are not stored in the current CRM yet.',
  colQuote: 'Winning quote', colBuyer: 'Buyer', colProducts: 'Products', colValue: 'Value', colOutcome: 'Outcome',
  wonQuote: 'Won quote',
  openAria: (buyer: string) => `Open winning quotation for ${buyer}`,
  empty: 'No won quotations are ready for handoff.',
};
