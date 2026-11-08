import 'dart:js_interop';

@JS('chatCryptoSpikeRoundtrip')
external JSPromise<JSString> _runCryptoRoundtrip();

Future<String> runCryptoRoundtripFromWasm() async =>
    (await _runCryptoRoundtrip().toDart).toDart;

Future<Map<String, String>> openAndroidCryptoStore(String passphrase) =>
    throw UnsupportedError('Android crypto store is not available on Flutter Web.');

Future<void> closeAndroidCryptoStore() =>
    throw UnsupportedError('Android crypto store is not available on Flutter Web.');
