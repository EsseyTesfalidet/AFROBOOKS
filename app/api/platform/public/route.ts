import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';

export async function GET() {
  try {
    const adminDb = await getAdminDb();
    const snap = await adminDb.collection('platformSettings').doc('global').get();
    const data = snap.data() ?? {};

    return NextResponse.json({
      newUserSignupsOpen: data.newUserSignupsOpen ?? true,
      newSellerSignupsOpen: data.newSellerSignupsOpen ?? true,
      subscriptionSalesActive: data.subscriptionSalesActive ?? true,
      maintenanceMode: data.maintenanceMode ?? false,
    });
  } catch (error) {
    console.error('platform public settings error:', error);
    return NextResponse.json(
      {
        newUserSignupsOpen: true,
        newSellerSignupsOpen: true,
        subscriptionSalesActive: true,
        maintenanceMode: false,
      },
      { status: 200 }
    );
  }
}
