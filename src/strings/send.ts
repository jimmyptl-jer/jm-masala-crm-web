// Strings for sending a quote to the buyer: the Email / WhatsApp choice, the Issue sheet and the Share sheet's
// "send from the app" block.
export const send = {
  // the choice
  choiceLabel: 'Send to the buyer',
  email: 'Email',
  whatsapp: 'WhatsApp',
  none: "Don't send now",
  noneHint: 'Issue only. You can send it later from the quote.',
  // under each option
  sentFromApp: (to: string) => `Sent from the app to ${to}`,
  opensOwn: (what: string) => `Opens ${what} with the message ready. You press Send.`,
  ownMail: 'your mail program',
  ownWhatsapp: 'WhatsApp',
  noEmail: 'No email saved for this buyer. Add one on the buyer page.',
  noNumber: 'No WhatsApp or phone number saved for this buyer. Add one on the buyer page.',
  noteLabel: 'Add a short message (optional)',
  notePlaceholder: 'e.g. Rates are valid for May shipment.',

  // Issue sheet
  issueTitle: 'Issue this quote',
  issueWarning: 'Once issued, a quote cannot be edited. You can only make a new revision.',
  issueOnly: 'Issue quote',
  issueSendEmail: 'Issue & send by email',
  issueSendWhatsapp: 'Issue & send on WhatsApp',
  issueOpenEmail: 'Issue & open email',
  issueOpenWhatsapp: 'Issue & open WhatsApp',
  cancel: 'Cancel',

  // after issuing
  issuedAndSent: (to: string) => `Quote issued and sent to ${to}`,
  issuedSendFailed: (why: string) => `Quote issued, but it was not sent: ${why}`,
  issuedShareNext: 'Quote issued. Choose how to send it.',

  // Share sheet block
  sendTitle: 'Send from the app',
  sendButtonEmail: 'Send email now',
  sendButtonWhatsapp: 'Send on WhatsApp now',
  sentOk: (to: string) => `Sent to ${to}`,
  sendOrManual: 'Or share it yourself',
} as const;
