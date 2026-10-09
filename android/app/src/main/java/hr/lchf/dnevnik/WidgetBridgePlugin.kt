package hr.lchf.dnevnik

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.Context
import android.content.IntentFilter
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
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
        e.putFloat("protein", (call.getDouble("protein") ?: 0.0).toFloat())
        e.putFloat("proteinTarget", (call.getDouble("proteinTarget") ?: 0.0).toFloat())
        val ket = call.getString("ketText")
        if (ket != null) {
            e.putString("ketText", ket).putString("ketDate", call.getString("ketDate") ?: "").putString("ketTime", call.getString("ketTime") ?: "")
            e.putInt("ketColor", try { android.graphics.Color.parseColor(call.getString("ketColor") ?: "#EFE3C9") } catch (_: Exception) { 0xFFEFE3C9.toInt() })
            e.putBoolean("gluWarn", call.getBoolean("gluWarn") ?: false)
        } else e.remove("ketText").remove("ketDate").remove("ketTime").remove("ketColor").remove("gluWarn")
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

    /** Sigurnosna kopija preko Androidovog izbornika Dijeli (Google disk, Datoteke, e-mail…). */
    @PluginMethod
    fun shareBackup(call: PluginCall) {
        val json = call.getString("json") ?: return call.reject("Nema podataka")
        val name = call.getString("filename") ?: "porki-kopija.json"
        try {
            val dir = File(context.cacheDir, "backup").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
            val file = File(dir, name)
            file.writeText(json, Charsets.UTF_8)
            val uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", file)
            val send = Intent(Intent.ACTION_SEND)
                .setType("application/json")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_SUBJECT, "Porki – sigurnosna kopija")
                .putExtra(Intent.EXTRA_TITLE, name)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            send.clipData = ClipData.newRawUri(name, uri)

            // Sustav javlja kad korisnik odabere odredište (aplikaciju za spremanje/dijeljenje)
            val action = context.packageName + ".BACKUP_TARGET_CHOSEN"
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context, i: Intent) {
                    try { context.unregisterReceiver(this) } catch (_: Exception) { }
                    notifyListeners("backupShared", JSObject())
                }
            }
            ContextCompat.registerReceiver(context, receiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED)
            val chosen = PendingIntent.getBroadcast(context, 20, Intent(action).setPackage(context.packageName),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
            val chooser = Intent.createChooser(send, "Spremi ili podijeli kopiju", chosen.intentSender)
            activity.startActivity(chooser)
            call.resolve()
        } catch (e: Exception) {
            call.reject(e.message ?: "Izvoz nije uspio", e)
        }
    }

    /** Izvještaj kao HTML privitak u aplikaciji za e-mail, s upisanom adresom i naslovom. */
    @PluginMethod
    fun shareReport(call: PluginCall) {
        val html = call.getString("html") ?: return call.reject("Nema izvještaja")
        val name = call.getString("filename") ?: "porki-izvjestaj.html"
        val email = call.getString("email") ?: ""
        try {
            val dir = File(context.cacheDir, "reports").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
            val file = File(dir, name)
            file.writeText(html, Charsets.UTF_8)
            val uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", file)
            val send = Intent(Intent.ACTION_SEND)
                .setType("text/html")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_SUBJECT, call.getString("subject") ?: "Porki – izvještaj")
                .putExtra(Intent.EXTRA_TEXT, call.getString("text") ?: "")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            if (email.isNotBlank()) send.putExtra(Intent.EXTRA_EMAIL, arrayOf(email))
            send.clipData = ClipData.newRawUri(name, uri)
            // ponudi samo aplikacije za e-mail; ako ih nema, običan izbornik Dijeli
            val mailOnly = Intent(send).apply { selector = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")) }
            val target = if (mailOnly.resolveActivity(context.packageManager) != null) mailOnly else send
            activity.startActivity(Intent.createChooser(target, "Pošalji izvještaj"))
            call.resolve()
        } catch (e: Exception) {
            call.reject(e.message ?: "Slanje nije uspjelo", e)
        }
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
