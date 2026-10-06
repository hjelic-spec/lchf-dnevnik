package hr.lchf.dnevnik

import android.content.Context
import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/** Prenosi podatke iz web-sučelja u widget i radnju dodirnutu na widgetu natrag u sučelje. */
@CapacitorPlugin(name = "WidgetBridge")
class WidgetBridgePlugin : Plugin() {

    companion object {
        @JvmField
        var pendingAction: String? = null
    }

    @PluginMethod
    fun update(call: PluginCall) {
        val e = context.getSharedPreferences(PorkiWidget.PREFS, Context.MODE_PRIVATE).edit()
        e.putLong("fastStart", call.getLong("fastStart") ?: 0L)
        e.putFloat("fastGoal", (call.getDouble("fastGoal") ?: 16.0).toFloat())
        e.putFloat("weight", (call.getDouble("weight") ?: 0.0).toFloat())
        e.putString("weightDate", call.getString("weightDate") ?: "")
        val rate = call.getDouble("rate")
        if (rate != null) e.putFloat("rate", rate.toFloat()) else e.remove("rate")
        e.putFloat("carbs", (call.getDouble("carbs") ?: 0.0).toFloat())
        e.putFloat("carbLimit", (call.getDouble("carbLimit") ?: 25.0).toFloat())
        e.putString("carbDate", call.getString("carbDate") ?: "")
        e.apply()
        PorkiWidget.refreshAll(context)
        call.resolve()
    }

    // Aplikacija je već otvorena, a dodirnut je widget: MainActivity je spremila radnju, javi sučelju
    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        if (pendingAction != null) notifyListeners("widgetAction", JSObject())
    }

    @PluginMethod
    fun consumeAction(call: PluginCall) {
        val a = pendingAction
        pendingAction = null
        call.resolve(JSObject().apply { if (a != null) put("action", a) })
    }
}
