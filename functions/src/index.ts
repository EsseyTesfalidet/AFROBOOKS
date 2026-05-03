import * as admin from 'firebase-admin';
import { processMonthlyPayouts } from './stripe/processPayouts';
import { processMonthlyBorrowPayouts } from './subscriptions/processBorrows';
import { sendNotificationEmail } from './notifications/sendNotification';
import { setAdminRole } from './admin/setRole';

admin.initializeApp();

export { processMonthlyPayouts, processMonthlyBorrowPayouts, sendNotificationEmail, setAdminRole };
