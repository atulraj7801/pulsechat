import { randomBytes } from 'node:crypto';
// Run locally and paste into the hosting dashboard; never commit the output.
console.log(`JWT_SECRET=${randomBytes(48).toString('hex')}`);
console.log(`UPLOAD_SECRET=${randomBytes(48).toString('hex')}`);
