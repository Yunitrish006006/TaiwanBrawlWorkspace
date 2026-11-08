import 'package:flutter/services.dart';

const _channel = MethodChannel('dev.taiwanbrawl/chat_crypto_probe');

Future<String> runCryptoRoundtripFromWasm() =>
    throw UnsupportedError('The WASM roundtrip button is only available on Flutter Web.');

Future<Map<String, String>> openAndroidCryptoStore(String passphrase) async {
  final result = await _channel.invokeMapMethod<String, String>(
    'openStore',
    {'passphrase': passphrase},
  );
  if (result == null) throw StateError('Android crypto bridge returned no result.');
  return result;
}

Future<void> closeAndroidCryptoStore() => _channel.invokeMethod<void>('closeStore');
