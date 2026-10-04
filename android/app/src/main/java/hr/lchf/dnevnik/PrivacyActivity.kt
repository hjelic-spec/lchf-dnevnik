package hr.lchf.dnevnik

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView

/** Objašnjenje korištenja podataka – Health Connect ga prikazuje uz zahtjev za dozvolama. */
class PrivacyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val web = WebView(this)
        web.fitsSystemWindows = true
        setContentView(web)
        web.loadUrl("file:///android_asset/public/privacy.html")
    }
}
