package com.afrobs.app;



public class DelegationService extends
        com.google.androidbrowserhelper.trusted.DelegationService {
    @Override
    public void onCreate() {
        super.onCreate();
        registerExtraCommandHandler(new com.google.androidbrowserhelper.playbilling.digitalgoods.DigitalGoodsRequestHandler(getApplicationContext()));
    }
}
