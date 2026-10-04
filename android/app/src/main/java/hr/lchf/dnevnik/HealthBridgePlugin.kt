package hr.lchf.dnevnik

import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.ZoneId

/**
 * Most između web-sučelja i Health Connecta. Samo čita podatke:
 * ukupne i aktivne kalorije, korake i tjelesnu masu.
 */
@CapacitorPlugin(name = "HealthBridge")
class HealthBridgePlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val provider = "com.google.android.apps.healthdata"

    private val permTotal = HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class)
    private val permActive = HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class)
    private val permSteps = HealthPermission.getReadPermission(StepsRecord::class)
    private val permWeight = HealthPermission.getReadPermission(WeightRecord::class)
    private val permissions = setOf(permTotal, permActive, permSteps, permWeight)

    private fun sdkStatus(): String = when (HealthConnectClient.getSdkStatus(context, provider)) {
        HealthConnectClient.SDK_AVAILABLE -> "available"
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
        else -> if (android.os.Build.VERSION.SDK_INT >= 28) "not_installed" else "unavailable"
    }

    private fun client() = HealthConnectClient.getOrCreate(context)

    private fun grantedArray(granted: Set<String>): JSArray {
        val a = JSArray()
        granted.filter { it in permissions }.forEach { a.put(it) }
        return a
    }

    @PluginMethod
    fun status(call: PluginCall) {
        val st = sdkStatus()
        if (st != "available") {
            call.resolve(JSObject().apply { put("status", st); put("granted", JSArray()) })
            return
        }
        scope.launch {
            try {
                val g = client().permissionController.getGrantedPermissions()
                call.resolve(JSObject().apply { put("status", st); put("granted", grantedArray(g)) })
            } catch (e: Exception) {
                call.reject(e.message ?: "Greška Health Connecta", e)
            }
        }
    }

    @PluginMethod
    fun requestAccess(call: PluginCall) {
        if (sdkStatus() != "available") {
            call.reject("Health Connect nije dostupan")
            return
        }
        val intent = PermissionController.createRequestPermissionResultContract(provider).createIntent(context, permissions)
        startActivityForResult(call, intent, "accessResult")
    }

    @ActivityCallback
    fun accessResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        scope.launch {
            try {
                val g = client().permissionController.getGrantedPermissions()
                call.resolve(JSObject().apply { put("granted", grantedArray(g)) })
            } catch (e: Exception) {
                call.reject(e.message ?: "Greška pri dozvolama", e)
            }
        }
    }

    /** Dnevni zbrojevi za raspon datuma (lokalna vremenska zona), from/to = "YYYY-MM-DD". */
    @PluginMethod
    fun readDays(call: PluginCall) {
        val from = call.getString("from")
        val to = call.getString("to")
        if (from == null || to == null) {
            call.reject("Nedostaje from/to")
            return
        }
        scope.launch {
            try {
                val c = client()
                val granted = c.permissionController.getGrantedPermissions()
                val metrics = mutableSetOf<AggregateMetric<*>>()
                if (permTotal in granted) metrics += TotalCaloriesBurnedRecord.ENERGY_TOTAL
                if (permActive in granted) metrics += ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL
                if (permSteps in granted) metrics += StepsRecord.COUNT_TOTAL
                val zone = ZoneId.systemDefault()
                val days = JSArray()
                var d = LocalDate.parse(from)
                val end = LocalDate.parse(to)
                while (!d.isAfter(end)) {
                    val range = TimeRangeFilter.between(d.atStartOfDay(zone).toInstant(), d.plusDays(1).atStartOfDay(zone).toInstant())
                    val o = JSObject()
                    o.put("date", d.toString())
                    if (metrics.isNotEmpty()) {
                        val agg = withContext(Dispatchers.IO) { c.aggregate(AggregateRequest(metrics, range)) }
                        agg[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.let { o.put("total", it.inKilocalories) }
                        agg[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.let { o.put("active", it.inKilocalories) }
                        agg[StepsRecord.COUNT_TOTAL]?.let { o.put("steps", it) }
                    }
                    if (permWeight in granted) {
                        val r = withContext(Dispatchers.IO) {
                            c.readRecords(ReadRecordsRequest(WeightRecord::class, range, ascendingOrder = false, pageSize = 1))
                        }
                        r.records.firstOrNull()?.let { o.put("weight", it.weight.inKilograms) }
                    }
                    days.put(o)
                    d = d.plusDays(1)
                }
                call.resolve(JSObject().apply { put("days", days) })
            } catch (e: Exception) {
                call.reject(e.message ?: "Čitanje nije uspjelo", e)
            }
        }
    }

    /** Otvara postavke Health Connecta ili Play Store ako nije instaliran. */
    @PluginMethod
    fun openHealthConnect(call: PluginCall) {
        val intent = if (sdkStatus() == "available") Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
        else Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$provider&url=healthconnect%3A%2F%2Fonboarding")).setPackage("com.android.vending")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            try {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$provider")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                call.resolve()
            } catch (e2: Exception) {
                call.reject("Ne mogu otvoriti Health Connect")
            }
        }
    }
}
