export class EmailConfirmationRequiredError extends Error {
  constructor() {
    super('We sent a confirmation link to your email. Open it, then come back and sign in.');
    this.name = 'EmailConfirmationRequiredError';
  }
}
