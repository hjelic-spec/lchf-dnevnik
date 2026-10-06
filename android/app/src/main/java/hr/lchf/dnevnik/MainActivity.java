package hr.lchf.dnevnik;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HealthBridgePlugin.class);
        registerPlugin(WidgetBridgePlugin.class);
        rememberWidgetAction(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        rememberWidgetAction(intent);
        super.onNewIntent(intent);
    }

    // Radnju s widgeta (weight / food / fast) preuzima web-sučelje preko WidgetBridge.consumeAction()
    private void rememberWidgetAction(Intent intent) {
        if (intent != null && intent.hasExtra("widget_action")) {
            WidgetBridgePlugin.pendingAction = intent.getStringExtra("widget_action");
            intent.removeExtra("widget_action");
        }
    }
}
