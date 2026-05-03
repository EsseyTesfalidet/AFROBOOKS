import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Triggered whenever a new notification document is created.
// Sends a push notification if the user has an FCM token stored.
export const sendNotificationEmail = functions.firestore
  .document('notifications/{notifId}')
  .onCreate(async (snap) => {
    const db = admin.firestore();
    const notif = snap.data();
    if (!notif?.userId) return null;

    const userDoc = await db.collection('users').doc(notif.userId).get();
    const user = userDoc.data();
    if (!user) return null;

    // FCM push (if token stored)
    const fcmToken: string | undefined = user.fcmToken;
    if (fcmToken) {
      try {
        await admin.messaging().send({
          token: fcmToken,
          notification: { title: notif.title, body: notif.message },
          data: { actionUrl: notif.actionUrl ?? '' },
          webpush: {
            notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-72.png' },
          },
        });
      } catch (err) {
        console.error('FCM send error:', err);
        // Token may be stale — clear it
        await userDoc.ref.update({ fcmToken: admin.firestore.FieldValue.delete() });
      }
    }

    return null;
  });
