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

/** Payment Request adapter for one-time videos, including server-verified account binding. */
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
            if (!sku.matches("afrobooks_video_[a-z0-9_]{1,100}") || !accountId.matches("[a-f0-9]{64}")) {
                fail("Invalid video or account information."); return;
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
                        .setProductId(sku).setProductType(BillingClient.ProductType.INAPP).build();
                billing.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder()
                        .setProductList(Collections.singletonList(product)).build(), (queryResult, products) -> {
                    if (isFinishing() || launched) return;
                    if (queryResult.getResponseCode() != BillingClient.BillingResponseCode.OK || products.getProductDetailsList().size() != 1) {
                        fail("This video is not available for purchase on this Google account."); return;
                    }
                    ProductDetails details = products.getProductDetailsList().get(0);
                    List<ProductDetails.OneTimePurchaseOfferDetails> offers = details.getOneTimePurchaseOfferDetailsList();
                    // A curated product has one buy option: no rental, preorder or multi-offer ambiguity.
                    if (!sku.equals(details.getProductId()) || offers == null || offers.size() != 1
                            || offers.get(0).getRentalDetails() != null || offers.get(0).getPreorderDetails() != null) {
                        fail("Configure one standard buy option for this video."); return;
                    }
                    BillingFlowParams.ProductDetailsParams item = BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(details).setOfferToken(offers.get(0).getOfferToken()).build();
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
