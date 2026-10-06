package com.afrobs.app;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.browser.trusted.Token;
import com.google.androidbrowserhelper.trusted.SharedPreferencesTokenStore;
import com.android.billingclient.api.*;
import org.json.JSONObject;
import java.util.Collections;
import java.util.List;

/** Account-bound checkout for videos, audio titles and the monthly Music pass. */
public class VideoPaymentActivity extends Activity implements PurchasesUpdatedListener {
    private static final String METHOD = "https://play.google.com/billing";
    private BillingClient billing;
    private String sku;
    private String accountId;
    private boolean launched;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeout = () -> fail("Google Play did not respond. Please try again.");

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ComponentName caller = getCallingActivity();
        Token trusted = new SharedPreferencesTokenStore(this).load();
        if (caller == null || trusted == null || !trusted.matches(caller.getPackageName(), getPackageManager())) {
            fail("Open checkout from the verified AfroBooks app."); return;
        }
        // Match the browser-helper adapter's attribution of the verified TWA browser.
        getIntent().putExtra("PROXY_PACKAGE", caller.getPackageName());
        try {
            Bundle methods = getIntent().getBundleExtra("methodData");
            JSONObject data = new JSONObject(methods == null ? "{}" : methods.getString(METHOD, "{}"));
            sku = data.optString("sku"); accountId = data.optString("obfuscatedAccountId");
            if (!(sku.matches("afrobooks_(video|audio)_[a-z0-9_]{1,100}") || sku.equals("afrobooks_music_monthly")) || !accountId.matches("[a-f0-9]{64}")) {
                fail("Invalid title or account information."); return;
            }
        } catch (Exception ignored) { fail("Invalid purchase request."); return; }
        // Never relaunch checkout automatically after process recreation.
        if (state != null) { fail("Checkout interrupted. Restore purchases before trying again."); return; }
        billing = BillingClient.newBuilder(this).setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection().build();
        handler.postDelayed(timeout, 30000);
        billing.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) {
                if (isFinishing()) return;
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { fail("Google Play is unavailable."); return; }
                QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(sku).setProductType(sku.equals("afrobooks_music_monthly") ? BillingClient.ProductType.SUBS : BillingClient.ProductType.INAPP).build();
                billing.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder()
                        .setProductList(Collections.singletonList(product)).build(), (queryResult, products) -> {
                    if (isFinishing() || launched) return;
                    if (queryResult.getResponseCode() != BillingClient.BillingResponseCode.OK || products.getProductDetailsList().size() != 1) {
                        fail("This title is not available for purchase on this Google account."); return;
                    }
                    ProductDetails details = products.getProductDetailsList().get(0);
                    if (!sku.equals(details.getProductId())) { fail("The product does not match checkout."); return; }
                    String offerToken;
                    if (sku.equals("afrobooks_music_monthly")) {
                        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
                        if (offers == null || offers.size() != 1 || !offers.get(0).getBasePlanId().equals("monthly")
                                || offers.get(0).getOfferId() != null || offers.get(0).getPricingPhases().getPricingPhaseList().size() != 1
                                || !offers.get(0).getPricingPhases().getPricingPhaseList().get(0).getBillingPeriod().equals("P1M")
                                || offers.get(0).getPricingPhases().getPricingPhaseList().get(0).getRecurrenceMode() != ProductDetails.RecurrenceMode.INFINITE_RECURRING) {
                            fail("Configure one standard monthly music plan, without introductory offers."); return;
                        }
                        offerToken = offers.get(0).getOfferToken();
                    } else {
                        List<ProductDetails.OneTimePurchaseOfferDetails> offers = details.getOneTimePurchaseOfferDetailsList();
                        if (offers == null || offers.size() != 1 || offers.get(0).getRentalDetails() != null || offers.get(0).getPreorderDetails() != null) {
                            fail("Configure one standard buy option for this title."); return;
                        }
                        offerToken = offers.get(0).getOfferToken();
                    }
                    BillingFlowParams.ProductDetailsParams item = BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(details).setOfferToken(offerToken).build();
                    BillingFlowParams params = BillingFlowParams.newBuilder()
                            .setProductDetailsParamsList(Collections.singletonList(item))
                            .setObfuscatedAccountId(accountId).build();
                    launched = true; handler.removeCallbacks(timeout);
                    BillingResult launch = billing.launchBillingFlow(VideoPaymentActivity.this, params);
                    if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) fail("Checkout could not open. If already purchased, use Restore purchases.");
                });
            }
            @Override public void onBillingServiceDisconnected() { /* Setup timeout handles failure before checkout. */ }
        });
    }
    @Override public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null) {
            fail("Checkout closed. Restore purchases if Google shows a charge."); return;
        }
        for (Purchase purchase : purchases) {
            AccountIdentifiers identifiers = purchase.getAccountIdentifiers();
            if (purchase.getProducts().size() == 1 && purchase.getProducts().contains(sku)
                    && identifiers != null && accountId.equals(identifiers.getObfuscatedAccountId())) {
                try {
                    JSONObject data = new JSONObject(); data.put("purchaseToken", purchase.getPurchaseToken());
                    finishResult(RESULT_OK, data.toString()); return;
                } catch (Exception ignored) { break; }
            }
        }
        fail("Purchase could not be matched. Use Restore purchases.");
    }
    private void fail(String message) {
        try { JSONObject data = new JSONObject(); data.put("error", message); finishResult(RESULT_CANCELED, data.toString()); }
        catch (Exception ignored) { setResult(RESULT_CANCELED); finish(); }
    }
    private void finishResult(int code, String details) {
        if (isFinishing()) return;
        Intent response = new Intent(); response.putExtra("methodName", METHOD); response.putExtra("details", details);
        setResult(code, response); finish();
    }
    @Override protected void onDestroy() {
        handler.removeCallbacks(timeout);
        if (billing != null) billing.endConnection();
        super.onDestroy();
    }
}
