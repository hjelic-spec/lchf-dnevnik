package hr.lchf.dnevnik

import android.content.Context
import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileOutputStream

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
        val diff = call.getDouble("weightDiff")
        if (diff != null) e.putFloat("weightDiff", diff.toFloat()).putString("weightDiffRef", call.getString("weightDiffRef") ?: "")
        else e.remove("weightDiff").remove("weightDiffRef")
        val bt = call.getDouble("balToday")
        if (bt != null) e.putFloat("balToday", bt.toFloat()) else e.remove("balToday")
        val bw = call.getDouble("balWeek")
        if (bw != null) e.putFloat("balWeek", bw.toFloat()).putInt("balWeekDays", call.getInt("balWeekDays") ?: 7) else e.remove("balWeek")
        e.putString("balDate", call.getString("balDate") ?: "")
        e.apply()
        PorkiWidget.refreshAll(context)
        call.resolve()
    }

    // Aplikacija je već otvorena, a dodirnut je widget: MainActivity je spremila radnju, javi sučelju
    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        if (pendingAction != null) notifyListeners("widgetAction", JSObject())
    }

    /** Trajna kopija podataka aplikacije: WebView localStorage na disk zapisuje s odgodom. */
    private fun dataFile() = File(context.filesDir, "porki-data.json")

    @PluginMethod
    fun saveData(call: PluginCall) {
        val json = call.getString("json") ?: return call.reject("Nema podataka")
        Thread {
            try {
                synchronized(WidgetBridgePlugin::class.java) {
                    val tmp = File(context.filesDir, "porki-data.tmp")
                    FileOutputStream(tmp).use { out ->
                        out.write(json.toByteArray(Charsets.UTF_8))
                        out.fd.sync()
                    }
                    if (!tmp.renameTo(dataFile())) throw IllegalStateException("rename")
                }
                call.resolve()
            } catch (e: Exception) {
                call.reject(e.message ?: "Spremanje nije uspjelo", e)
            }
        }.start()
    }

    @PluginMethod
    fun loadData(call: PluginCall) {
        val f = dataFile()
        call.resolve(JSObject().apply { if (f.exists()) put("json", f.readText(Charsets.UTF_8)) })
    }

    @PluginMethod
    fun consumeAction(call: PluginCall) {
        val a = pendingAction
        pendingAction = null
        // Post pokrenut na widgetu dok aplikacija nije bila otvorena
        val p = context.getSharedPreferences(PorkiWidget.PREFS, Context.MODE_PRIVATE)
        val started = p.getLong("pendingFastStart", 0L)
        if (started > 0L) p.edit().remove("pendingFastStart").commit()
        call.resolve(JSObject().apply {
            if (a != null) put("action", a)
            if (started > 0L) put("fastStart", started)
        })
    }
}
