package dev.taiwanbrawl.chatcrypto.flutter_web

import android.os.Handler
import android.os.Looper
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import org.matrix.rustcomponents.sdk.crypto.OlmMachine
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

class MainActivity : FlutterActivity() {
    private val worker = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var cryptoMachine: OlmMachine? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "dev.taiwanbrawl/chat_crypto_probe",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "openStore" -> {
                    val passphrase = call.argument<String>("passphrase")
                    if (passphrase.isNullOrBlank() || passphrase.length < 12) {
                        result.error("invalid_passphrase", "測試密碼至少需要 12 個字元。", null)
                    } else {
                        worker.execute {
                            try {
                                cryptoMachine?.close()
                                val storePath = File(filesDir, "tb-chat-crypto-probe").absolutePath
                                val machine = OlmMachine(
                                    "@android-probe:example.org",
                                    "TB_ANDROID_PROBE",
                                    storePath,
                                    passphrase,
                                )
                                cryptoMachine = machine
                                val keys = machine.identityKeys().toSortedMap()
                                if (keys.isEmpty() || keys.values.any { it.isBlank() }) {
                                    throw IllegalStateException("原生 crypto store 沒有回傳有效的裝置身分金鑰。")
                                }
                                val keyMaterial = keys.entries.joinToString("\n") { "${it.key}:${it.value}" }
                                val fingerprint = MessageDigest.getInstance("SHA-256")
                                    .digest(keyMaterial.toByteArray(Charsets.UTF_8))
                                    .joinToString("") { "%02x".format(it) }
                                mainHandler.post {
                                    result.success(
                                        mapOf(
                                            "userId" to machine.userId(),
                                            "deviceId" to machine.deviceId(),
                                            "fingerprint" to fingerprint,
                                        ),
                                    )
                                }
                            } catch (error: Throwable) {
                                cryptoMachine?.close()
                                cryptoMachine = null
                                mainHandler.post {
                                    result.error("crypto_store_error", error.message ?: error.javaClass.simpleName, null)
                                }
                            }
                        }
                    }
                }
                "closeStore" -> worker.execute {
                    cryptoMachine?.close()
                    cryptoMachine = null
                    mainHandler.post { result.success(null) }
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onDestroy() {
        worker.execute {
            cryptoMachine?.close()
            cryptoMachine = null
        }
        worker.shutdown()
        super.onDestroy()
    }
}
